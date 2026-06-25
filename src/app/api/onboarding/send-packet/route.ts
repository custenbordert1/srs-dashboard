import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { executeOnboardingSend } from "@/lib/candidate-onboarding-send-queue/execute-onboarding-send";
import { buildTemplateSignerPayload } from "@/lib/onboarding-signer";
import { validateSendPacketRequest } from "@/lib/onboarding-template-registry";
import { auditFromSession } from "@/lib/security/audit-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    auditAction: "onboarding_send_packet",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const validation = validateSendPacketRequest(body);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.error, field: validation.field },
      { status: 400 },
    );
  }

  const input = body as Record<string, unknown>;
  const candidateId = typeof input.candidateId === "string" ? input.candidateId.trim() : "";
  const candidateName = typeof input.candidateName === "string" ? input.candidateName.trim() : "";

  const signerPayload = buildTemplateSignerPayload({
    templateKey: validation.templateKey,
    candidateName,
    emailSources: [input.candidateEmail, input.email, input.email_address, validation.recipientEmail],
  });
  if (!signerPayload.ok) {
    return NextResponse.json(
      { ok: false, error: signerPayload.error, field: signerPayload.field },
      { status: 400 },
    );
  }

  const result = await executeOnboardingSend({
    candidateId,
    candidateName,
    candidateEmail: signerPayload.recipientEmail,
    templateKey: validation.templateKey,
    byUserId: session.userId,
    recordWorkflowFailureOnError: true,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        workflow: result.workflow,
        transient: result.transient,
      },
      { status: result.httpStatus ?? 502 },
    );
  }

  auditFromSession(session, {
    action: "onboarding_send_packet",
    entityType: "candidate_workflow",
    entityId: candidateId,
    metadata: {
      templateKey: validation.templateKey,
      signatureRequestId: result.signatureRequestId,
    },
  });

  return NextResponse.json({
    ok: true,
    signatureRequestId: result.signatureRequestId,
    signingStatus: result.signingStatus,
    paperworkStatus: result.paperworkStatus,
    workflow: result.workflow,
  });
}
