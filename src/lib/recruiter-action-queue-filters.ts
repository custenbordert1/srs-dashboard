import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  hoursSince,
  isFollowUpOverdue,
  isMelReadyStatus,
  isPaperworkPendingStatus,
} from "@/lib/candidate-action-sla";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";

/** Hours since last recruiter touch (falls back to applied date). */
export const AGING_BUCKET_24H = 24;
export const AGING_BUCKET_3D = 72;
export const AGING_BUCKET_7D = 168;

export type RecruiterAgingBucket = "fresh" | "24h" | "3d" | "7d+";

export type RecruiterQuickFilterId =
  | "all"
  | "my-owned"
  | "needs-follow-up"
  | "no-response"
  | "paperwork-pending"
  | "interview-needed"
  | "ready-mel"
  | "priority";

export const RECRUITER_QUICK_FILTERS: Array<{ id: RecruiterQuickFilterId; label: string }> = [
  { id: "all", label: "All" },
  { id: "my-owned", label: "My owned" },
  { id: "needs-follow-up", label: "Needs follow-up" },
  { id: "no-response", label: "No response" },
  { id: "paperwork-pending", label: "Paperwork pending" },
  { id: "interview-needed", label: "Interview needed" },
  { id: "ready-mel", label: "Ready for MEL" },
  { id: "priority", label: "Priority" },
];

export const RECRUITER_AGING_BUCKET_LABELS: Record<RecruiterAgingBucket, string> = {
  fresh: "< 24h",
  "24h": "24h+",
  "3d": "3d+",
  "7d+": "7d+",
};

const TERMINAL_STATUSES = new Set(["Not Qualified", "Active Rep", "Loaded in MEL"]);

function touchIso(row: ScoredCandidateWorkflowRow): string | null {
  return row.lastActionAt ?? row.appliedDate ?? null;
}

export function computeRecruiterAgingBucket(
  row: ScoredCandidateWorkflowRow,
  referenceMs = Date.now(),
): RecruiterAgingBucket {
  const hours = hoursSince(touchIso(row), referenceMs);
  if (hours === null) return "7d+";
  if (hours < AGING_BUCKET_24H) return "fresh";
  if (hours < AGING_BUCKET_3D) return "24h";
  if (hours < AGING_BUCKET_7D) return "3d";
  return "7d+";
}

export function isNoResponseCandidate(
  row: ScoredCandidateWorkflowRow,
  referenceMs = Date.now(),
): boolean {
  if (TERMINAL_STATUSES.has(row.workflowStatus)) return false;
  if (row.recruitingActions.needsFollowUp) return true;
  if (
    isFollowUpOverdue({
      recruitingActions: row.recruitingActions,
      followUpDueAt: row.followUpDueAt,
      referenceMs,
    })
  ) {
    return true;
  }
  const inactiveHours = hoursSince(touchIso(row), referenceMs);
  return inactiveHours !== null && inactiveHours >= AGING_BUCKET_24H;
}

export function matchesRecruiterQuickFilter(
  row: ScoredCandidateWorkflowRow,
  filter: RecruiterQuickFilterId,
  actingRecruiter: string,
  referenceMs = Date.now(),
): boolean {
  if (filter === "all") return true;

  const recruiter = row.assignedRecruiter.trim();
  const acting = actingRecruiter.trim();

  switch (filter) {
    case "my-owned":
      return recruiter === acting && !isUnassignedRecruiter(recruiter);
    case "needs-follow-up":
      return (
        row.recruitingActions.needsFollowUp ||
        Boolean(row.followUpDueAt) ||
        isFollowUpOverdue({
          recruitingActions: row.recruitingActions,
          followUpDueAt: row.followUpDueAt,
          referenceMs,
        })
      );
    case "no-response":
      return isNoResponseCandidate(row, referenceMs);
    case "paperwork-pending":
      return isPaperworkPendingStatus(row.workflowStatus);
    case "interview-needed":
      return (
        row.recruitingActions.recommendInterview ||
        row.workflowStatus === "Qualified"
      );
    case "ready-mel":
      return isMelReadyStatus(row.workflowStatus);
    case "priority":
      return row.recruitingActions.priorityList;
    default:
      return true;
  }
}

export type RecruiterActionQueueCounts = {
  needsFollowUp: number;
  noResponse: number;
  paperworkPending: number;
  interviewNeeded: number;
  readyForMel: number;
  priority: number;
  aging24h: number;
  aging3d: number;
  aging7dPlus: number;
};

export function buildRecruiterActionQueueCounts(
  candidates: ScoredCandidateWorkflowRow[],
  referenceMs = Date.now(),
): RecruiterActionQueueCounts {
  let needsFollowUp = 0;
  let noResponse = 0;
  let paperworkPending = 0;
  let interviewNeeded = 0;
  let readyForMel = 0;
  let priority = 0;
  let aging24h = 0;
  let aging3d = 0;
  let aging7dPlus = 0;

  for (const row of candidates) {
    if (matchesRecruiterQuickFilter(row, "needs-follow-up", "", referenceMs)) needsFollowUp += 1;
    if (isNoResponseCandidate(row, referenceMs)) noResponse += 1;
    if (isPaperworkPendingStatus(row.workflowStatus)) paperworkPending += 1;
    if (
      row.recruitingActions.recommendInterview ||
      row.workflowStatus === "Qualified"
    ) {
      interviewNeeded += 1;
    }
    if (isMelReadyStatus(row.workflowStatus)) readyForMel += 1;
    if (row.recruitingActions.priorityList) priority += 1;

    const bucket = computeRecruiterAgingBucket(row, referenceMs);
    if (bucket === "24h") aging24h += 1;
    else if (bucket === "3d") aging3d += 1;
    else if (bucket === "7d+") aging7dPlus += 1;
  }

  return {
    needsFollowUp,
    noResponse,
    paperworkPending,
    interviewNeeded,
    readyForMel,
    priority,
    aging24h,
    aging3d,
    aging7dPlus,
  };
}
