import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { mapSignatureRequestToPaperworkStatus } from "@/lib/candidate-paperwork";
import {
  recordCandidatePaperworkFailed,
  recordCandidatePaperworkSent,
} from "@/lib/candidate-workflow-store";
import { DropboxSignError, sendTemplateSignatureRequest } from "@/lib/dropbox-sign";
import { buildTemplateSignerPayload, maskEmailForLog } from "@/lib/onboarding-signer";
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

  try {
    const templateLabel = ONBOARDING_TEMPLATE_REGISTRY[validation.templateKey].label;
    console.info("[dropbox-sign] send_with_template signers", {
      templateKey: validation.templateKey,
      templateId: validation.templateId,
      signers: [
        {
          role: signerPayload.signer.role,
          name: signerPayload.signer.name,
          email: maskEmailForLog(signerPayload.recipientEmail),
        },
      ],
    });
    const signature = await sendTemplateSignatureRequest({
      templateId: validation.templateId,
      signers: [signerPayload.signer],
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
