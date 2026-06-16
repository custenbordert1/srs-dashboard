import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { hoursSince, isMelReadyStatus, isPaperworkPendingStatus } from "@/lib/candidate-action-sla";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { isFollowUpOverdue } from "@/lib/candidate-action-sla";
import type { ActionCenterCandidateRow, SmartFilterId } from "@/lib/recruiter-action-center/types";

export const SMART_FILTERS: Array<{ id: SmartFilterId; label: string }> = [
  { id: "work-now", label: "Work Now" },
  { id: "overdue", label: "Overdue" },
  { id: "paperwork", label: "Paperwork" },
  { id: "ready-for-mel", label: "Ready for MEL" },
  { id: "interview-follow-up", label: "Interview Follow-Up" },
  { id: "no-touch-24h", label: "No Touch 24+" },
  { id: "no-touch-48h", label: "No Touch 48+" },
  { id: "assigned-to-me", label: "Assigned to Me" },
  { id: "unassigned", label: "Unassigned" },
  { id: "high-priority", label: "High Priority" },
];

export function matchesSmartFilter(
  row: ActionCenterCandidateRow | ScoredCandidateWorkflowRow,
  filter: SmartFilterId,
  actingRecruiter: string,
  referenceMs = Date.now(),
): boolean {
  const scored = "sourceRow" in row ? row.sourceRow : row;
  const priorityScore = "priorityScore" in row ? row.priorityScore : 0;
  const bottlenecks = "bottlenecks" in row ? row.bottlenecks : [];

  switch (filter) {
    case "work-now":
      return priorityScore >= 90 || ("priorityBand" in row && row.priorityBand === "work-immediately");
    case "overdue":
      return (
        bottlenecks.includes("follow-up-overdue") ||
        isFollowUpOverdue({
          recruitingActions: scored.recruitingActions,
          followUpDueAt: scored.followUpDueAt,
          referenceMs,
        })
      );
    case "paperwork":
      return isPaperworkPendingStatus(scored.workflowStatus) || scored.workflowStatus === "Paperwork Sent";
    case "ready-for-mel":
      return isMelReadyStatus(scored.workflowStatus);
    case "interview-follow-up":
      return scored.recruitingActions.recommendInterview || scored.workflowStatus === "Qualified";
    case "no-touch-24h":
      return bottlenecks.includes("no-touch-24h") || bottlenecks.includes("no-touch-48h");
    case "no-touch-48h":
      return bottlenecks.includes("no-touch-48h");
    case "assigned-to-me":
      return scored.assignedRecruiter.trim() === actingRecruiter.trim();
    case "unassigned":
      return isUnassignedRecruiter(scored.assignedRecruiter);
    case "high-priority":
      return priorityScore >= 70 || scored.recruitingActions.priorityList;
    default:
      return true;
  }
}

export function filterActionCenterRows(
  rows: ActionCenterCandidateRow[],
  filter: SmartFilterId | null,
  actingRecruiter: string,
  referenceMs = Date.now(),
): ActionCenterCandidateRow[] {
  if (!filter) return rows;
  return rows.filter((row) => matchesSmartFilter(row, filter, actingRecruiter, referenceMs));
}

export function countSmartFilterMatches(
  rows: ActionCenterCandidateRow[],
  actingRecruiter: string,
  referenceMs = Date.now(),
): Record<SmartFilterId, number> {
  const counts = {} as Record<SmartFilterId, number>;
  for (const { id } of SMART_FILTERS) {
    counts[id] = rows.filter((row) => matchesSmartFilter(row, id, actingRecruiter, referenceMs)).length;
  }
  return counts;
}

export function isNoTouchHours(row: ScoredCandidateWorkflowRow, hours: number, referenceMs: number): boolean {
  const touchHours = hoursSince(row.lastActionAt ?? row.appliedDate, referenceMs);
  return touchHours !== null && touchHours >= hours;
}
