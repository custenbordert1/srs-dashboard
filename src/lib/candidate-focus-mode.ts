import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateSummaryStripFilterId } from "@/lib/candidates-workspace-preferences";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
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

export function matchesCandidateSummaryStrip(
  row: ScoredCandidateWorkflowRow,
  filter: CandidateSummaryStripFilterId,
  actingRecruiter: string,
  referenceMs = Date.now(),
): boolean {
  if (filter === "all") return true;
  switch (filter) {
    case "assigned":
      return !isUnassignedRecruiter(row.assignedRecruiter);
    case "needs-follow-up":
      return matchesRecruiterQuickFilter(row, "needs-follow-up", actingRecruiter, referenceMs);
    case "paperwork":
      return matchesRecruiterQuickFilter(row, "paperwork-pending", actingRecruiter, referenceMs);
    case "ready-mel":
      return matchesRecruiterQuickFilter(row, "ready-mel", actingRecruiter, referenceMs);
    case "unassigned":
      return isUnassignedRecruiter(row.assignedRecruiter);
    default:
      return true;
  }
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
  summaryStripFilter?: CandidateSummaryStripFilterId;
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
  if (filters.summaryStripFilter && filters.summaryStripFilter !== "all") {
    const stripLabels: Record<CandidateSummaryStripFilterId, string> = {
      all: "All",
      assigned: "Assigned",
      "needs-follow-up": "Needs follow-up",
      paperwork: "Paperwork",
      "ready-mel": "Ready for MEL",
      unassigned: "Unassigned",
    };
    parts.push(`Summary: ${stripLabels[filters.summaryStripFilter]}`);
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
