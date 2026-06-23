import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import {
  buildScoredWorkflowRow,
  type ScoredCandidateWorkflowRow,
} from "@/lib/build-candidate-workflow-row";
import type { CandidateWorkflowRecord, CandidateWorkflowState } from "@/lib/candidate-workflow-types";

/** Prefer the workflow record with the latest updatedAt when merging local and remote state. */
export function mergeWorkflowStateByUpdatedAt(
  local: CandidateWorkflowState,
  incoming: CandidateWorkflowState,
): CandidateWorkflowState {
  const merged = { ...incoming };
  for (const [candidateId, localRecord] of Object.entries(local)) {
    const remote = incoming[candidateId];
    if (!remote) {
      merged[candidateId] = localRecord;
      continue;
    }
    const localAt = Date.parse(localRecord.updatedAt ?? "");
    const remoteAt = Date.parse(remote.updatedAt ?? "");
    if (Number.isFinite(localAt) && Number.isFinite(remoteAt) && localAt > remoteAt) {
      merged[candidateId] = localRecord;
    }
  }
  return merged;
}

/** Rebuild one enriched table row immediately after a workflow mutation (avoids setTimeout enrichment lag). */
export function patchEnrichedRowsFromWorkflow(
  rows: ScoredCandidateWorkflowRow[],
  breezy: BreezyCandidate | undefined,
  workflow: CandidateWorkflowRecord,
  job?: BreezyJob,
): ScoredCandidateWorkflowRow[] {
  if (!breezy || breezy.candidateId !== workflow.candidateId) {
    return rows;
  }
  const updatedRow = buildScoredWorkflowRow(breezy, workflow, { job });
  if (rows.length === 0) {
    return rows;
  }
  const hasRow = rows.some((row) => row.candidateId === updatedRow.candidateId);
  if (!hasRow) {
    return [...rows, updatedRow];
  }
  return rows.map((row) => (row.candidateId === updatedRow.candidateId ? updatedRow : row));
}

/** Rebuild enriched rows from a full workflow bundle (e.g. after POST /api/candidates/workflows). */
export function syncEnrichedRowsFromWorkflowState(
  rows: ScoredCandidateWorkflowRow[],
  workflows: CandidateWorkflowState,
  committedCandidates: BreezyCandidate[],
  jobsByPositionId: Map<string, BreezyJob>,
): ScoredCandidateWorkflowRow[] {
  if (rows.length === 0) {
    return rows;
  }
  return rows.map((row) => {
    const workflow = workflows[row.candidateId];
    if (!workflow) {
      return row;
    }
    const breezy = committedCandidates.find((candidate) => candidate.candidateId === row.candidateId);
    if (!breezy) {
      return row;
    }
    return buildScoredWorkflowRow(breezy, workflow, {
      job: jobsByPositionId.get(breezy.positionId),
    });
  });
}
