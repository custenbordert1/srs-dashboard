import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { matchesRecruiterQuickFilter } from "@/lib/recruiter-action-queue-filters";

/** MY WORK — assigned to me, follow-up due, paperwork pending, or ready for MEL. */
export function matchesMyWorkFocus(
  row: ScoredCandidateWorkflowRow,
  actingRecruiter: string,
  referenceMs = Date.now(),
): boolean {
  return (
    matchesRecruiterQuickFilter(row, "my-owned", actingRecruiter, referenceMs) ||
    matchesRecruiterQuickFilter(row, "needs-follow-up", actingRecruiter, referenceMs) ||
    matchesRecruiterQuickFilter(row, "paperwork-pending", actingRecruiter, referenceMs) ||
    matchesRecruiterQuickFilter(row, "ready-mel", actingRecruiter, referenceMs)
  );
}

export type CandidateTableFilterSnapshot = {
  search: string;
  sourceFilter: string;
  stageFilter: string;
  positionFilter: string;
  cityFilter: string;
  stateFilter: string;
  workflowFilter: string;
  matchFilter: string;
  appliedFrom: string;
  appliedTo: string;
  recruiterQuickFilter: string;
  focusMode: "all" | "my-work";
  actingRecruiter: string;
};

const ALL_FILTER = "__all__";

export function summarizeCandidateTableFilters(
  filters: CandidateTableFilterSnapshot,
): string {
  const parts: string[] = [];
  if (filters.focusMode === "my-work") {
    parts.push(`Focus: My work (${filters.actingRecruiter})`);
  }
  if (filters.recruiterQuickFilter !== "all") {
    parts.push(`Queue: ${filters.recruiterQuickFilter}`);
  }
  if (filters.search.trim()) parts.push(`Search: ${filters.search.trim()}`);
  if (filters.sourceFilter !== ALL_FILTER) parts.push(`Source: ${filters.sourceFilter}`);
  if (filters.stageFilter !== ALL_FILTER) parts.push(`Stage: ${filters.stageFilter}`);
  if (filters.positionFilter !== ALL_FILTER) parts.push(`Position: ${filters.positionFilter}`);
  if (filters.cityFilter !== ALL_FILTER) parts.push(`City: ${filters.cityFilter}`);
  if (filters.stateFilter !== ALL_FILTER) parts.push(`State: ${filters.stateFilter}`);
  if (filters.workflowFilter !== ALL_FILTER) parts.push(`Workflow: ${filters.workflowFilter}`);
  if (filters.matchFilter !== ALL_FILTER) parts.push(`Match: ${filters.matchFilter}`);
  if (filters.appliedFrom) parts.push(`Applied from: ${filters.appliedFrom}`);
  if (filters.appliedTo) parts.push(`Applied to: ${filters.appliedTo}`);
  return parts.length > 0 ? parts.join("; ") : "None (all candidates)";
}
