import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { hasCandidatePrimaryEmail } from "@/lib/onboarding-signer";
import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";

export type OnboardingTemplateOption = {
  key: OnboardingTemplateKey;
  label: string;
  configured: boolean;
};

export type SendPaperworkEligibilityInput = {
  candidate: Pick<
    ScoredCandidateWorkflowRow,
    "candidateId" | "email" | "paperworkStatus" | "signatureRequestId"
  > & { email_address?: string };
  templateKey: OnboardingTemplateKey;
  onboardingConfigured: boolean;
  onboardingConfigLoaded: boolean;
  onboardingConfigError: string | null;
  paperworkTemplates: OnboardingTemplateOption[];
  sendBusy: boolean;
  /** When set, skips parsing email from candidate (menu/toolbar without row email). */
  hasCandidateEmail?: boolean;
};

export type SendPaperworkBlockReason =
  | "sending"
  | "config_loading"
  | "config_error"
  | "missing_api_key"
  | "missing_template"
  | "missing_email"
  | "already_signed"
  | "pending_signature";

const BLOCK_MESSAGES: Record<SendPaperworkBlockReason, string> = {
  sending: "Sending packet…",
  config_loading: "Checking Dropbox Sign configuration…",
  config_error: "Dropbox Sign config unavailable",
  missing_api_key: "DROPBOX_SIGN_API_KEY not configured",
  missing_template: "Onboarding packet template not configured",
  missing_email: "Missing candidate email",
  already_signed: "Paperwork already signed",
  pending_signature: "Packet already sent — awaiting signature",
};

export function isOnboardingTemplateConfigured(
  templates: OnboardingTemplateOption[],
  templateKey: OnboardingTemplateKey,
): boolean {
  return templates.some((t) => t.key === templateKey && t.configured);
}

/** First blocking reason, or null when Send should be enabled. */
export function getSendPaperworkBlockReason(
  input: SendPaperworkEligibilityInput,
): SendPaperworkBlockReason | null {
  if (input.sendBusy) return "sending";
  if (!input.onboardingConfigLoaded) return "config_loading";
  if (input.onboardingConfigError) return "config_error";
  if (!input.onboardingConfigured) return "missing_api_key";
  if (!isOnboardingTemplateConfigured(input.paperworkTemplates, input.templateKey)) {
    return "missing_template";
  }
  const hasEmail =
    input.hasCandidateEmail ?? hasCandidatePrimaryEmail(input.candidate);
  if (!hasEmail) return "missing_email";
  if (input.candidate.paperworkStatus === "signed") return "already_signed";
  if (
    input.candidate.signatureRequestId &&
    (input.candidate.paperworkStatus === "sent" || input.candidate.paperworkStatus === "viewed")
  ) {
    return "pending_signature";
  }
  return null;
}

export function sendPaperworkBlockMessage(
  reason: SendPaperworkBlockReason,
  input?: SendPaperworkEligibilityInput,
): string {
  if (reason === "config_error" && input?.onboardingConfigError) {
    return `${BLOCK_MESSAGES.config_error}: ${input.onboardingConfigError}`;
  }
  if (reason === "missing_template" && input) {
    const def = input.paperworkTemplates.find((t) => t.key === input.templateKey);
    return def
      ? `${BLOCK_MESSAGES.missing_template} (set ${def.label} template ID in .env.local)`
      : BLOCK_MESSAGES.missing_template;
  }
  return BLOCK_MESSAGES[reason];
}

export function sendPaperworkTooltip(input: SendPaperworkEligibilityInput): string {
  const reason = getSendPaperworkBlockReason(input);
  if (reason) return sendPaperworkBlockMessage(reason, input);
  if (reason === "pending_signature") {
    return "Packet pending in Dropbox Sign — use Refresh only if webhook is delayed";
  }
  if (reason === "already_signed") {
    return BLOCK_MESSAGES.already_signed;
  }
  return "Send onboarding packet via Dropbox Sign";
}

/** Dev-only: logs which gate blocked send. */
export function logSendPaperworkEligibility(
  label: string,
  input: SendPaperworkEligibilityInput,
): void {
  if (process.env.NODE_ENV === "production") return;
  const reason = getSendPaperworkBlockReason(input);
  const payload = {
    blockReason: reason,
    blockMessage: reason ? sendPaperworkBlockMessage(reason, input) : null,
    candidateId: input.candidate.candidateId,
    templateKey: input.templateKey,
    hasEmail: input.hasCandidateEmail ?? hasCandidatePrimaryEmail(input.candidate),
    onboardingConfigured: input.onboardingConfigured,
    onboardingConfigLoaded: input.onboardingConfigLoaded,
    onboardingConfigError: input.onboardingConfigError,
    templateConfigured: isOnboardingTemplateConfigured(input.paperworkTemplates, input.templateKey),
    paperworkStatus: input.candidate.paperworkStatus,
    signatureRequestId: input.candidate.signatureRequestId ? "[set]" : null,
  };
  console.debug(`[onboarding-send] ${label}`, payload);
}
