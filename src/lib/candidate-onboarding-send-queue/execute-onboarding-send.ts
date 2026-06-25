import { mapSignatureRequestToPaperworkStatus } from "@/lib/candidate-paperwork";
import { findActiveOnboardingRecord } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import {
  getCandidateWorkflowState,
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
import {
  duplicatePaperworkSendBlockReason,
  syncActiveOnboardingRecordAfterSend,
} from "@/lib/onboarding-send-packet-sync";
import {
  ONBOARDING_TEMPLATE_REGISTRY,
  resolveTemplateId,
  type OnboardingTemplateKey,
} from "@/lib/onboarding-template-registry";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  isTransientSendError,
  resolveSendErrorMessage,
  resolveSendHttpStatus,
} from "@/lib/candidate-onboarding-send-queue/classify-send-error";

export type ExecuteOnboardingSendInput = {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  templateKey: OnboardingTemplateKey;
  byUserId?: string;
  /** When false, transient Dropbox failures do not mark workflow paperwork failed. */
  recordWorkflowFailureOnError?: boolean;
  /** Send queue worker passes the active onboarding id to allow in-flight sends. */
  inFlightOnboardingId?: string;
};

export type ExecuteOnboardingSendSuccess = {
  ok: true;
  signatureRequestId: string;
  signingStatus: string;
  paperworkStatus: ReturnType<typeof mapSignatureRequestToPaperworkStatus>;
  workflow: CandidateWorkflowRecord;
};

export type ExecuteOnboardingSendFailure = {
  ok: false;
  error: string;
  httpStatus: number | null;
  transient: boolean;
  workflow?: CandidateWorkflowRecord;
};

export type ExecuteOnboardingSendResult =
  | ExecuteOnboardingSendSuccess
  | ExecuteOnboardingSendFailure;

export type ExecuteOnboardingSendDeps = {
  sendTemplateSignatureRequest?: typeof sendTemplateSignatureRequest;
  resolveTemplateId?: typeof resolveTemplateId;
};

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

export async function executeOnboardingSend(
  input: ExecuteOnboardingSendInput,
  deps: ExecuteOnboardingSendDeps = {},
): Promise<ExecuteOnboardingSendResult> {
  const sendFn = deps.sendTemplateSignatureRequest ?? sendTemplateSignatureRequest;
  const resolveTemplate = deps.resolveTemplateId ?? resolveTemplateId;
  const templateId = resolveTemplate(input.templateKey);
  if (!templateId) {
    return {
      ok: false,
      error: `Template ${input.templateKey} is not configured.`,
      httpStatus: 400,
      transient: false,
    };
  }

  const signerPayload = buildTemplateSignerPayload({
    templateKey: input.templateKey,
    candidateName: input.candidateName,
    emailSources: [input.candidateEmail],
  });
  if (!signerPayload.ok) {
    return {
      ok: false,
      error: signerPayload.error,
      httpStatus: 400,
      transient: false,
    };
  }

  const [workflows, activeOnboarding] = await Promise.all([
    getCandidateWorkflowState(),
    findActiveOnboardingRecord(input.candidateId),
  ]);
  const duplicateReason = duplicatePaperworkSendBlockReason({
    workflow: workflows[input.candidateId],
    activeOnboarding,
    allowSendInProgressForOnboardingId: input.inFlightOnboardingId,
  });
  if (duplicateReason) {
    return {
      ok: false,
      error: duplicateReason,
      httpStatus: 409,
      transient: false,
    };
  }

  try {
    const templateLabel = ONBOARDING_TEMPLATE_REGISTRY[input.templateKey].label;
    const finalSigners = [signerPayload.signer];
    const registryRole = ONBOARDING_TEMPLATE_REGISTRY[input.templateKey].signerRole;
    const resolvedRole = resolveSignerRoleForTemplate(input.templateKey);
    const roleCheck = signerRoleMatchesEnv(signerPayload.signer.role);
    logDropboxSignDebug("before_sendTemplateSignatureRequest", {
      templateIdSelected: templateId,
      templateKey: input.templateKey,
      finalSignersArray: finalSigners,
      recipientEmailChosen: signerPayload.recipientEmail,
      signerRoleUsed: signerPayload.signer.role,
      registrySignerRole: registryRole,
      resolvedSignerRole: resolvedRole,
      candidateObjectKeys: ["candidateId", "candidateName", "candidateEmail"],
      candidatePayload: {
        candidateId: input.candidateId,
        candidateName: input.candidateName,
        candidateEmail: input.candidateEmail,
      },
      signersLengthIsZero: finalSigners.length === 0,
      anySignerEmailBlankOrNull: signersHaveBlankEmail(finalSigners),
      ...roleCheck,
    });
    const emailCopy = buildOnboardingEmailCopy({
      candidateName: input.candidateName,
      templateLabel,
    });
    const signature = await sendFn({
      templateId,
      signers: finalSigners,
      title: emailCopy.title,
      subject: emailCopy.subject,
      message: emailCopy.message,
    });

    const paperworkStatus = mapSignatureRequestToPaperworkStatus(signature);
    const workflow = await recordCandidatePaperworkSent({
      candidateId: input.candidateId,
      signatureRequestId: signature.signatureRequestId,
      templateKey: input.templateKey,
      onboardingContactEmail: signerPayload.recipientEmail,
      byUserId: input.byUserId,
    });

    await syncActiveOnboardingRecordAfterSend(input.candidateId, signature.signatureRequestId);

    return {
      ok: true,
      signatureRequestId: signature.signatureRequestId,
      signingStatus: signature.rawStatus,
      paperworkStatus,
      workflow,
    };
  } catch (error) {
    const message = resolveSendErrorMessage(error);
    const httpStatus = resolveSendHttpStatus(error);
    const transient = isTransientSendError({ error, httpStatus, message });
    const recordFailure = input.recordWorkflowFailureOnError !== false && !transient;

    let workflow: CandidateWorkflowRecord | undefined;
    if (recordFailure) {
      workflow = await recordCandidatePaperworkFailed({
        candidateId: input.candidateId,
        error: message,
        byUserId: input.byUserId,
      }).catch(() => undefined);
    }

    return {
      ok: false,
      error: message,
      httpStatus:
        httpStatus ??
        (error instanceof DropboxSignError && error.code === "missing_api_key" ? 503 : 502),
      transient,
      workflow,
    };
  }
}
