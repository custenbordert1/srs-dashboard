import type { BreezyCandidate } from "@/lib/breezy-api";
import type { CandidateIngestionStoreFile } from "@/lib/candidate-ingestion/types";
import type { AutonomousPaperworkBlockedRecord } from "@/lib/autonomous-paperwork-runner/types";

function parseActivityMs(candidate: BreezyCandidate): number {
  const updated = Date.parse(candidate.updatedDate ?? "");
  const created = Date.parse(candidate.createdDate ?? candidate.addedDate ?? "");
  return Math.max(Number.isFinite(updated) ? updated : 0, Number.isFinite(created) ? created : 0);
}

export function selectCandidatesForRunnerCycle(input: {
  store: CandidateIngestionStoreFile;
  lastSuccessfulRunAt: string | null;
  lastProcessedCheckpoint: string | null;
  blockedRegistry: Record<string, AutonomousPaperworkBlockedRecord>;
  fullReconciliation: boolean;
  mtdOnly?: boolean;
}): { candidateIds: string[]; newCandidateIds: string[] } {
  const allIds = Object.keys(input.store.candidates);

  if (input.fullReconciliation) {
    return { candidateIds: allIds, newCandidateIds: [] };
  }

  const checkpointMs = Date.parse(
    input.lastProcessedCheckpoint ?? input.lastSuccessfulRunAt ?? "",
  );
  const sinceMs = Number.isFinite(checkpointMs) ? checkpointMs : 0;

  const candidateIds = new Set<string>();
  const newCandidateIds: string[] = [];

  for (const [id, candidate] of Object.entries(input.store.candidates)) {
    const activityMs = parseActivityMs(candidate);
    const createdMs = Date.parse(candidate.createdDate ?? candidate.addedDate ?? "");
    if (activityMs >= sinceMs) {
      candidateIds.add(id);
    }
    if (Number.isFinite(createdMs) && createdMs >= sinceMs) {
      newCandidateIds.push(id);
    }
  }

  for (const id of Object.keys(input.blockedRegistry)) {
    candidateIds.add(id);
  }

  return {
    candidateIds: [...candidateIds],
    newCandidateIds,
  };
}

export function computeRunnerCheckpoint(store: CandidateIngestionStoreFile): string {
  let maxMs = Date.parse(store.updatedAt ?? "");
  for (const candidate of Object.values(store.candidates)) {
    maxMs = Math.max(maxMs, parseActivityMs(candidate));
  }
  return Number.isFinite(maxMs) ? new Date(maxMs).toISOString() : new Date().toISOString();
}
