import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { mapSignatureRequestToPaperworkStatus } from "@/lib/candidate-paperwork";
import {
  recordCandidatePaperworkFailed,
  recordCandidatePaperworkSent,
} from "@/lib/candidate-workflow-store";
import { DropboxSignError, sendTemplateSignatureRequest } from "@/lib/dropbox-sign";
import { ONBOARDING_TEMPLATE_REGISTRY, validateSendPacketRequest } from "@/lib/onboarding-template-registry";
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

  const input = body as Record<string, string>;
  const candidateId = input.candidateId.trim();
  const candidateName = input.candidateName.trim();
  const candidateEmail = input.candidateEmail.trim();

  try {
    const templateLabel = ONBOARDING_TEMPLATE_REGISTRY[validation.templateKey].label;
    const signature = await sendTemplateSignatureRequest({
      templateId: validation.templateId,
      signers: [
        {
          role: validation.signerRole,
          name: candidateName,
          emailAddress: candidateEmail,
        },
      ],
      title: `${templateLabel} — ${candidateName}`,
      subject: `SRS onboarding paperwork: ${templateLabel}`,
      message: "Please review and sign your onboarding documents.",
    });

    const paperworkStatus = mapSignatureRequestToPaperworkStatus(signature);
    const workflow = await recordCandidatePaperworkSent({
      candidateId,
      signatureRequestId: signature.signatureRequestId,
      templateKey: validation.templateKey,
      byUserId: session.userId,
    });

    auditFromSession(session, {
      action: "onboarding_send_packet",
      entityType: "candidate_workflow",
      entityId: candidateId,
      metadata: {
        templateKey: validation.templateKey,
        signatureRequestId: signature.signatureRequestId,
      },
    });

    return NextResponse.json({
      ok: true,
      signatureRequestId: signature.signatureRequestId,
      signingStatus: signature.rawStatus,
      paperworkStatus,
      workflow,
    });
  } catch (error) {
    const message =
      error instanceof DropboxSignError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to send onboarding paperwork.";

    const workflow = await recordCandidatePaperworkFailed({
      candidateId,
      error: message,
      byUserId: session.userId,
    }).catch(() => null);

    const status = error instanceof DropboxSignError && error.code === "missing_api_key" ? 503 : 502;
    return NextResponse.json(
      {
        ok: false,
        error: message,
        workflow: workflow ?? undefined,
      },
      { status },
    );
  }
}
