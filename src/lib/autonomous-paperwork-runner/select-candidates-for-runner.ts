import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { CandidateIngestionStoreFile } from "@/lib/candidate-ingestion/types";
import type { AutonomousPaperworkBlockedRecord } from "@/lib/autonomous-paperwork-runner/types";

function parseActivityMs(candidate: BreezyCandidate): number {
  const updated = Date.parse(candidate.updatedDate ?? "");
  const created = Date.parse(candidate.createdDate ?? candidate.addedDate ?? "");
  return Math.max(Number.isFinite(updated) ? updated : 0, Number.isFinite(created) ? created : 0);
}

export type RunnerSelectionResult = {
  candidateIds: string[];
  newCandidateIds: string[];
  staleEligibleRecovered: number;
  paperworkNeededCount: number;
  sendPaperworkActionCount: number;
};

export function selectCandidatesForRunnerCycle(input: {
  store: CandidateIngestionStoreFile;
  workflows: CandidateWorkflowState;
  lastSuccessfulRunAt: string | null;
  lastProcessedCheckpoint: string | null;
  blockedRegistry: Record<string, AutonomousPaperworkBlockedRecord>;
  readyToSendIds?: string[];
  fullReconciliation: boolean;
}): RunnerSelectionResult {
  const allIds = Object.keys(input.store.candidates);

  if (input.fullReconciliation) {
    return {
      candidateIds: allIds,
      newCandidateIds: [],
      staleEligibleRecovered: 0,
      paperworkNeededCount: 0,
      sendPaperworkActionCount: 0,
    };
  }

  const checkpointMs = Date.parse(
    input.lastProcessedCheckpoint ?? input.lastSuccessfulRunAt ?? "",
  );
  const sinceMs = Number.isFinite(checkpointMs) ? checkpointMs : 0;

  const candidateIds = new Set<string>();
  const newCandidateIds: string[] = [];
  let staleEligibleRecovered = 0;
  let paperworkNeededCount = 0;
  let sendPaperworkActionCount = 0;

  for (const [id, candidate] of Object.entries(input.store.candidates)) {
    const workflow = input.workflows[id];
    const activityMs = parseActivityMs(candidate);
    const createdMs = Date.parse(candidate.createdDate ?? candidate.addedDate ?? "");

    if (activityMs >= sinceMs) {
      candidateIds.add(id);
    }
    if (Number.isFinite(createdMs) && createdMs >= sinceMs) {
      newCandidateIds.push(id);
    }

    if (workflow?.workflowStatus === "Paperwork Needed") {
      candidateIds.add(id);
      paperworkNeededCount += 1;
      if (activityMs < sinceMs) staleEligibleRecovered += 1;
    }
    if (workflow?.actionType === "send-paperwork") {
      candidateIds.add(id);
      sendPaperworkActionCount += 1;
      if (activityMs < sinceMs && workflow.workflowStatus !== "Paperwork Needed") {
        staleEligibleRecovered += 1;
      }
    }
  }

  for (const id of Object.keys(input.blockedRegistry)) {
    candidateIds.add(id);
  }

  for (const id of input.readyToSendIds ?? []) {
    if (input.store.candidates[id]) {
      candidateIds.add(id);
      if (parseActivityMs(input.store.candidates[id]!) < sinceMs) staleEligibleRecovered += 1;
    }
  }

  return {
    candidateIds: [...candidateIds],
    newCandidateIds,
    staleEligibleRecovered,
    paperworkNeededCount,
    sendPaperworkActionCount,
  };
}

export function computeRunnerCheckpoint(store: CandidateIngestionStoreFile): string {
  let maxMs = Date.parse(store.updatedAt ?? "");
  for (const candidate of Object.values(store.candidates)) {
    maxMs = Math.max(maxMs, parseActivityMs(candidate));
  }
  return Number.isFinite(maxMs) ? new Date(maxMs).toISOString() : new Date().toISOString();
}

export function shouldReEvaluateBlockedRecord(input: {
  previous: AutonomousPaperworkBlockedRecord;
  currentBlockerCategory: string | null;
  currentCategory: string;
}): boolean {
  if (input.currentCategory === "ready_to_send" || input.currentCategory === "sent") return true;
  if (!input.currentBlockerCategory) return true;
  return input.previous.blockerCategory !== input.currentBlockerCategory;
}
