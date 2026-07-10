import { getCandidateWorkflowBundle } from "@/lib/candidate-workflow-store";
import { listAllCandidateOnboardingRecords } from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";

const TERMINAL_ONBOARDING = new Set(["completed", "ready_for_mel", "declined", "expired", "failed"]);
const TERMINAL_WORKFLOW = new Set(["Ready for MEL", "Loaded in MEL", "Active Rep", "Not Qualified"]);

export type ActivePaperworkPacket = {
  candidateId: string;
  candidateName: string;
  signatureRequestId: string;
  workflow: CandidateWorkflowRecord;
  onboarding: CandidateOnboardingRecord | null;
};

function isActivePacket(input: {
  workflow: CandidateWorkflowRecord;
  onboarding: CandidateOnboardingRecord | null;
}): boolean {
  if (!input.workflow.signatureRequestId?.trim()) return false;
  if (TERMINAL_WORKFLOW.has(input.workflow.workflowStatus)) return false;
  if (input.onboarding && TERMINAL_ONBOARDING.has(input.onboarding.status) && input.onboarding.readyForMel) {
    return false;
  }
  if (input.workflow.paperworkStatus === "signed" && input.workflow.workflowStatus === "Signed") {
    return input.onboarding?.status !== "ready_for_mel" && input.onboarding?.status !== "completed";
  }
  return (
    input.workflow.paperworkStatus === "sent" ||
    input.workflow.paperworkStatus === "viewed" ||
    input.workflow.workflowStatus === "Paperwork Sent" ||
    input.workflow.workflowStatus === "Signed"
  );
}

export async function selectActivePaperworkPackets(input?: {
  candidateIds?: string[];
}): Promise<ActivePaperworkPacket[]> {
  const { readIngestionStore } = await import("@/lib/candidate-ingestion/ingestion-store");
  const [bundle, store, onboardingRecords] = await Promise.all([
    getCandidateWorkflowBundle(),
    readIngestionStore(),
    listAllCandidateOnboardingRecords(),
  ]);

  const onboardingByCandidate = new Map(onboardingRecords.map((r) => [r.candidateId, r]));
  const scope = input?.candidateIds?.length ? new Set(input.candidateIds) : null;
  const packets: ActivePaperworkPacket[] = [];

  for (const [candidateId, workflow] of Object.entries(bundle.workflows)) {
    if (scope && !scope.has(candidateId)) continue;
    const onboarding = onboardingByCandidate.get(candidateId) ?? null;
    if (!isActivePacket({ workflow, onboarding })) continue;
    if (!workflow.signatureRequestId) continue;

    const ingested = store.candidates[candidateId];
    const candidateName = ingested
      ? `${ingested.firstName ?? ""} ${ingested.lastName ?? ""}`.trim() || candidateId
      : candidateId;
    packets.push({
      candidateId,
      candidateName,
      signatureRequestId: workflow.signatureRequestId,
      workflow,
      onboarding,
    });
  }

  return packets;
}
