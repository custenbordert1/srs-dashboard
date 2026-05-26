import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { mapSignatureRequestToPaperworkStatus } from "@/lib/candidate-paperwork";
import {
  recordCandidatePaperworkFailed,
  recordCandidatePaperworkSent,
} from "@/lib/candidate-workflow-store";
import { DropboxSignError, sendTemplateSignatureRequest } from "@/lib/dropbox-sign";
import {
  candidatePayloadKeys,
  logDropboxSignDebug,
  signerRoleMatchesEnv,
  signersHaveBlankEmail,
} from "@/lib/dropbox-sign-debug";
import { buildTemplateSignerPayload, resolveSignerRoleForTemplate } from "@/lib/onboarding-signer";
import { ONBOARDING_TEMPLATE_REGISTRY, validateSendPacketRequest } from "@/lib/onboarding-template-registry";
import { auditFromSession } from "@/lib/security/audit-log";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function buildOnboardingEmailCopy(input: {
  candidateName: string;
  templateLabel: string;
}): { title: string; subject: string; message: string } {
  const trimmedName = input.candidateName.trim();
  const displayName = trimmedName.length > 0 ? trimmedName : "Candidate";
  const firstToken = trimmedName.split(/\s+/)[0]?.replace(/[.,]+$/, "") ?? "";
  const firstName =
    firstToken.length > 0 && !/^unknown$/i.test(firstToken) ? firstToken : "there";

  const subject = `${firstName}, your SRS merchandising paperwork is ready`;
  const message = [
    `Hi ${firstName},`,
    "",
    "Congratulations on moving forward with SRS Merchandising.",
    "",
    `Please review and sign the attached ${input.templateLabel}.`,
    "",
    "If you have questions, reply to your recruiter or contact our recruiting team.",
    "",
    "Thank you,",
    "SRS Merchandising Recruiting",
  ].join("\n");
  const title = `SRS Merchandising — ${input.templateLabel} — ${displayName}`;

  return { title, subject, message };
}

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["admin", "executive", "recruiter"],
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
    const finalSigners = [signerPayload.signer];
    const registryRole = ONBOARDING_TEMPLATE_REGISTRY[validation.templateKey].signerRole;
    const resolvedRole = resolveSignerRoleForTemplate(validation.templateKey);
    const roleCheck = signerRoleMatchesEnv(signerPayload.signer.role);
    logDropboxSignDebug("before_sendTemplateSignatureRequest", {
      templateIdSelected: validation.templateId,
      templateKey: validation.templateKey,
      finalSignersArray: finalSigners,
      recipientEmailChosen: signerPayload.recipientEmail,
      signerRoleUsed: signerPayload.signer.role,
      registrySignerRole: registryRole,
      resolvedSignerRole: resolvedRole,
      candidateObjectKeys: candidatePayloadKeys(input),
      candidatePayload: input,
      signersLengthIsZero: finalSigners.length === 0,
      anySignerEmailBlankOrNull: signersHaveBlankEmail(finalSigners),
      ...roleCheck,
    });
    const emailCopy = buildOnboardingEmailCopy({ candidateName, templateLabel });
    const signature = await sendTemplateSignatureRequest({
      templateId: validation.templateId,
      signers: finalSigners,
      title: emailCopy.title,
      subject: emailCopy.subject,
      message: emailCopy.message,
    });

    const paperworkStatus = mapSignatureRequestToPaperworkStatus(signature);
    const workflow = await recordCandidatePaperworkSent({
      candidateId,
      signatureRequestId: signature.signatureRequestId,
      templateKey: validation.templateKey,
      onboardingContactEmail: signerPayload.recipientEmail,
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
