import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import {
  buildScoredWorkflowRow,
  type ScoredCandidateWorkflowRow,
} from "@/lib/build-candidate-workflow-row";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

/** Rebuild one enriched table row immediately after a workflow mutation (avoids setTimeout enrichment lag). */
export function patchEnrichedRowsFromWorkflow(
  rows: ScoredCandidateWorkflowRow[],
  breezy: BreezyCandidate | undefined,
  workflow: CandidateWorkflowRecord,
  job?: BreezyJob,
): ScoredCandidateWorkflowRow[] {
  if (rows.length === 0 || !breezy || breezy.candidateId !== workflow.candidateId) {
    return rows;
  }
  const updatedRow = buildScoredWorkflowRow(breezy, workflow, { job });
  return rows.map((row) => (row.candidateId === updatedRow.candidateId ? updatedRow : row));
}
