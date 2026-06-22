import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  calendarDaysSince,
  hoursSince,
  isFollowUpOverdue,
  isMelReadyStatus,
  isPaperworkPendingStatus,
} from "@/lib/candidate-action-sla";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";

/** Hours since last recruiter touch (falls back to applied date). */
export const AGING_BUCKET_24H = 24;
export const AGING_BUCKET_3D = 72;
export const AGING_BUCKET_7D = 168;

export type RecruiterAgingBucket = "fresh" | "24h" | "3d" | "7d+";

export type RecruiterQuickFilterId =
  | "all"
  | "my-owned"
  | "needs-review"
  | "needs-follow-up"
  | "no-response"
  | "overdue"
  | "unassigned"
  | "paperwork-pending"
  | "interview-needed"
  | "ready-mel"
  | "priority";

/** Primary queue tabs on the Candidates tab — filters the candidate table. */
export const CANDIDATE_QUEUE_TABS: Array<{ id: RecruiterQuickFilterId; label: string }> = [
  { id: "all", label: "All" },
  { id: "overdue", label: "Overdue" },
  { id: "unassigned", label: "Unassigned" },
  { id: "paperwork-pending", label: "Paperwork" },
  { id: "interview-needed", label: "Interview" },
  { id: "ready-mel", label: "Ready For MEL" },
];

export const RECRUITER_QUICK_FILTERS: Array<{ id: RecruiterQuickFilterId; label: string }> = [
  { id: "all", label: "All" },
  { id: "my-owned", label: "My owned" },
  { id: "needs-review", label: "Needs review" },
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
    case "needs-review":
      return row.workflowStatus === "Needs Review" && !row.lastActionAt;
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
    case "overdue":
      return isFollowUpOverdue({
        recruitingActions: row.recruitingActions,
        followUpDueAt: row.followUpDueAt,
        referenceMs,
      });
    case "unassigned":
      return isUnassignedRecruiter(row.assignedRecruiter);
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
  needsReview: number;
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

export function buildCandidateQueueTabCounts(
  candidates: ScoredCandidateWorkflowRow[],
  referenceMs = Date.now(),
): Record<RecruiterQuickFilterId, number> {
  const actionCounts = buildRecruiterActionQueueCounts(candidates, referenceMs);
  let overdue = 0;
  let unassigned = 0;
  for (const row of candidates) {
    if (matchesRecruiterQuickFilter(row, "overdue", "", referenceMs)) overdue += 1;
    if (matchesRecruiterQuickFilter(row, "unassigned", "", referenceMs)) unassigned += 1;
  }
  return {
    all: candidates.length,
    "my-owned": 0,
    "needs-review": actionCounts.needsReview,
    "needs-follow-up": actionCounts.needsFollowUp,
    "no-response": actionCounts.noResponse,
    overdue,
    unassigned,
    "paperwork-pending": actionCounts.paperworkPending,
    "interview-needed": actionCounts.interviewNeeded,
    "ready-mel": actionCounts.readyForMel,
    priority: actionCounts.priority,
  };
}

/** Days since applied treated as "newly applied" for the This Week inbox lane. */
export const RECRUITER_INBOX_THIS_WEEK_DAYS = 7;

export type RecruiterInboxSectionId =
  | "overdue-follow-ups"
  | "paperwork-pending"
  | "interview-needed"
  | "ready-for-mel"
  | "newly-applied"
  | "everything-else";

export const RECRUITER_INBOX_TODAY_SECTIONS: Array<{ id: RecruiterInboxSectionId; label: string }> = [
  { id: "overdue-follow-ups", label: "Overdue follow-ups" },
  { id: "paperwork-pending", label: "Paperwork pending" },
  { id: "interview-needed", label: "Interview needed" },
];

export const RECRUITER_INBOX_THIS_WEEK_SECTIONS: Array<{ id: RecruiterInboxSectionId; label: string }> = [
  { id: "ready-for-mel", label: "Ready for MEL" },
  { id: "newly-applied", label: "Newly applied" },
];

const INBOX_SECTION_PRIORITY: RecruiterInboxSectionId[] = [
  "overdue-follow-ups",
  "paperwork-pending",
  "interview-needed",
  "ready-for-mel",
  "newly-applied",
];

const EARLY_FUNNEL_STATUSES = new Set<CandidateWorkflowStatus>(["Applied", "Needs Review"]);

export function isNewlyAppliedCandidate(
  row: ScoredCandidateWorkflowRow,
  referenceMs = Date.now(),
): boolean {
  if (TERMINAL_STATUSES.has(row.workflowStatus)) return false;
  const days = calendarDaysSince(row.appliedDate, referenceMs);
  if (days === null || days > RECRUITER_INBOX_THIS_WEEK_DAYS) return false;
  return EARLY_FUNNEL_STATUSES.has(row.workflowStatus);
}

export function matchesRecruiterInboxSection(
  row: ScoredCandidateWorkflowRow,
  section: RecruiterInboxSectionId,
  actingRecruiter: string,
  referenceMs = Date.now(),
): boolean {
  switch (section) {
    case "overdue-follow-ups":
      return matchesRecruiterQuickFilter(row, "overdue", actingRecruiter, referenceMs);
    case "paperwork-pending":
      return matchesRecruiterQuickFilter(row, "paperwork-pending", actingRecruiter, referenceMs);
    case "interview-needed":
      return matchesRecruiterQuickFilter(row, "interview-needed", actingRecruiter, referenceMs);
    case "ready-for-mel":
      return matchesRecruiterQuickFilter(row, "ready-mel", actingRecruiter, referenceMs);
    case "newly-applied":
      return isNewlyAppliedCandidate(row, referenceMs);
    case "everything-else":
      return true;
    default:
      return false;
  }
}

export function assignRecruiterInboxSection(
  row: ScoredCandidateWorkflowRow,
  actingRecruiter: string,
  referenceMs = Date.now(),
): RecruiterInboxSectionId {
  for (const section of INBOX_SECTION_PRIORITY) {
    if (matchesRecruiterInboxSection(row, section, actingRecruiter, referenceMs)) {
      return section;
    }
  }
  return "everything-else";
}

export type RecruiterInboxSections = Record<RecruiterInboxSectionId, ScoredCandidateWorkflowRow[]>;

export function buildRecruiterInboxSections(
  candidates: ScoredCandidateWorkflowRow[],
  actingRecruiter: string,
  referenceMs = Date.now(),
): RecruiterInboxSections {
  const sections: RecruiterInboxSections = {
    "overdue-follow-ups": [],
    "paperwork-pending": [],
    "interview-needed": [],
    "ready-for-mel": [],
    "newly-applied": [],
    "everything-else": [],
  };
  for (const row of candidates) {
    const section = assignRecruiterInboxSection(row, actingRecruiter, referenceMs);
    sections[section].push(row);
  }
  return sections;
}

export function buildRecruiterInboxSectionCounts(
  candidates: ScoredCandidateWorkflowRow[],
  actingRecruiter: string,
  referenceMs = Date.now(),
): Record<RecruiterInboxSectionId, number> {
  const sections = buildRecruiterInboxSections(candidates, actingRecruiter, referenceMs);
  return Object.fromEntries(
    Object.entries(sections).map(([id, rows]) => [id, rows.length]),
  ) as Record<RecruiterInboxSectionId, number>;
}

export function queueParamToInboxSection(queue: RecruiterQuickFilterId): RecruiterInboxSectionId | null {
  switch (queue) {
    case "overdue":
    case "needs-follow-up":
      return "overdue-follow-ups";
    case "paperwork-pending":
      return "paperwork-pending";
    case "interview-needed":
      return "interview-needed";
    case "ready-mel":
      return "ready-for-mel";
    case "needs-review":
      return "newly-applied";
    default:
      return null;
  }
}

export function buildRecruiterActionQueueCounts(
  candidates: ScoredCandidateWorkflowRow[],
  referenceMs = Date.now(),
): RecruiterActionQueueCounts {
  let needsReview = 0;
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
    if (matchesRecruiterQuickFilter(row, "needs-review", "", referenceMs)) needsReview += 1;
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
    needsReview,
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
