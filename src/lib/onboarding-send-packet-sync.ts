import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import {
  findActiveOnboardingRecord,
  recordCandidateOnboarding,
} from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { reconcileWorkflowFromOnboarding } from "@/lib/workflow-onboarding-reconciliation";

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

export function buildSentOnboardingRecordUpdate(
  active: CandidateOnboardingRecord,
  signatureRequestId: string,
  now = new Date().toISOString(),
): CandidateOnboardingRecord {
  return {
    ...active,
    status: "sent",
    signatureRequestId,
    sentAt: now,
    statusHistory: [
      ...active.statusHistory,
      { at: now, status: "sent", detail: `Packet sent via send-packet — ${signatureRequestId}` },
    ],
  };
}

export async function syncActiveOnboardingRecordAfterSend(
  candidateId: string,
  signatureRequestId: string,
): Promise<CandidateOnboardingRecord | null> {
  const active = await findActiveOnboardingRecord(candidateId);
  if (!active) return null;
  const updated = buildSentOnboardingRecordUpdate(active, signatureRequestId);
  await recordCandidateOnboarding(updated);

  const workflows = await getCandidateWorkflowState();
  await reconcileWorkflowFromOnboarding({
    candidateId,
    workflow: workflows[candidateId] ?? null,
    onboarding: updated,
  });

  return updated;
}
