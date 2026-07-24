import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import {
  findActiveOnboardingRecord,
  recordCandidateOnboarding,
} from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-duplicate";
import { reconcileWorkflowFromOnboarding } from "@/lib/workflow-onboarding-reconciliation";

export { duplicatePaperworkSendBlockReason } from "@/lib/onboarding-send-packet-duplicate";

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
