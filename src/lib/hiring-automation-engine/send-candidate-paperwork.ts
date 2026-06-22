import { mapSignatureRequestToPaperworkStatus } from "@/lib/candidate-paperwork";
import { recordCandidatePaperworkFailed, recordCandidatePaperworkSent } from "@/lib/candidate-workflow-store";
import { DropboxSignError, sendTemplateSignatureRequest } from "@/lib/dropbox-sign";
import { buildTemplateSignerPayload } from "@/lib/onboarding-signer";
import { ONBOARDING_TEMPLATE_REGISTRY, resolveTemplateId } from "@/lib/onboarding-template-registry";
import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";

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

export type SendCandidatePaperworkInput = {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  templateKey?: OnboardingTemplateKey;
  byUserId?: string;
};

export type SendCandidatePaperworkResult =
  | { ok: true; signatureRequestId: string; paperworkStatus: string }
  | { ok: false; error: string };

export async function sendCandidatePaperwork(
  input: SendCandidatePaperworkInput,
): Promise<SendCandidatePaperworkResult> {
  const templateKey = input.templateKey ?? "onboarding_packet";
  const signerPayload = buildTemplateSignerPayload({
    templateKey,
    candidateName: input.candidateName,
    emailSources: [input.candidateEmail],
  });

  if (!signerPayload.ok) {
    return { ok: false, error: signerPayload.error };
  }

  try {
    const templateId = resolveTemplateId(templateKey);
    if (!templateId) {
      return { ok: false, error: "Onboarding packet template not configured." };
    }

    const templateLabel = ONBOARDING_TEMPLATE_REGISTRY[templateKey].label;
    const emailCopy = buildOnboardingEmailCopy({ candidateName: input.candidateName, templateLabel });
    const signature = await sendTemplateSignatureRequest({
      templateId,
      signers: [signerPayload.signer],
      title: emailCopy.title,
      subject: emailCopy.subject,
      message: emailCopy.message,
    });

    await recordCandidatePaperworkSent({
      candidateId: input.candidateId,
      signatureRequestId: signature.signatureRequestId,
      templateKey,
      onboardingContactEmail: signerPayload.recipientEmail,
      byUserId: input.byUserId,
    });

    return {
      ok: true,
      signatureRequestId: signature.signatureRequestId,
      paperworkStatus: mapSignatureRequestToPaperworkStatus(signature),
    };
  } catch (error) {
    const message =
      error instanceof DropboxSignError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Failed to send onboarding paperwork.";

    await recordCandidatePaperworkFailed({
      candidateId: input.candidateId,
      error: message,
      byUserId: input.byUserId,
    }).catch(() => null);

    return { ok: false, error: message };
  }
}
