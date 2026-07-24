import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

/**
 * Pure duplicate / in-flight packet gate used by eligibility evaluators.
 * Kept free of Node fs / store imports so client UI can reuse production rules.
 */
export function duplicatePaperworkSendBlockReason(input: {
  workflow?: CandidateWorkflowRecord | null;
  activeOnboarding?: CandidateOnboardingRecord | null;
  /** Allows the send queue worker to complete an in-flight send for this onboarding record. */
  allowSendInProgressForOnboardingId?: string;
}): string | null {
  const { workflow, activeOnboarding } = input;

  if (workflow?.paperworkStatus === "signed") {
    return "Paperwork already signed.";
  }

  if (
    workflow?.signatureRequestId &&
    (workflow.paperworkStatus === "sent" ||
      workflow.paperworkStatus === "viewed" ||
      workflow.workflowStatus === "Paperwork Sent")
  ) {
    return "Packet already sent — awaiting signature.";
  }

  if (activeOnboarding?.signatureRequestId) {
    return "Onboarding record already has an active signature request.";
  }

  if (activeOnboarding?.status === "sent" || activeOnboarding?.status === "completed") {
    return "Onboarding packet already sent.";
  }

  if (activeOnboarding?.status === "sending") {
    if (input.allowSendInProgressForOnboardingId === activeOnboarding.onboardingId) {
      return null;
    }
    return "Onboarding packet send in progress.";
  }

  if (activeOnboarding?.status === "queued" || activeOnboarding?.status === "retry_scheduled") {
    if (input.allowSendInProgressForOnboardingId === activeOnboarding.onboardingId) {
      return null;
    }
    return "Onboarding packet is queued for send.";
  }

  return null;
}
