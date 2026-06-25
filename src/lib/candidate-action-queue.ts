import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildCandidateSlaSnapshot,
  isMelReadyStatus,
  isPaperworkPendingStatus,
  type CandidateSlaSnapshot,
} from "@/lib/candidate-action-sla";
import { scoreQueuePriority } from "@/lib/recruiter-priority";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";

export type CandidateQueueLaneId =
  | "my-open"
  | "unassigned"
  | "follow-up-due"
  | "aging-applied"
  | "paperwork"
  | "ready-mel"
  | "training"
  | "priority"
  | "dm-review";

export const CANDIDATE_QUEUE_LANE_ORDER: CandidateQueueLaneId[] = [
  "my-open",
  "follow-up-due",
  "priority",
  "unassigned",
  "aging-applied",
  "paperwork",
  "ready-mel",
  "training",
  "dm-review",
];

export const CANDIDATE_QUEUE_LANE_LABELS: Record<CandidateQueueLaneId, string> = {
  "my-open": "My open",
  "unassigned": "Unassigned",
  "follow-up-due": "Follow-up due",
  "aging-applied": "Aging applied",
  paperwork: "Paperwork",
  "ready-mel": "Ready for MEL",
  training: "Training",
  priority: "Priority",
  "dm-review": "DM review",
};

export type QueueCandidateRow = ScoredCandidateWorkflowRow & {
  sla: CandidateSlaSnapshot;
  priorityScore: number;
  /** @deprecated Use priorityScore */
  queueScore: number;
  queueReasons: string[];
};

export type CandidateActionQueue = {
  lane: CandidateQueueLaneId;
  rows: QueueCandidateRow[];
  totalInLane: number;
};

export type CandidateQueueBoard = {
  lanes: Record<CandidateQueueLaneId, CandidateActionQueue>;
  actingRecruiter: string;
};

const INTAKE_STATUSES: CandidateWorkflowStatus[] = ["Applied", "Needs Review"];

export function isUnassignedRecruiter(name: string): boolean {
  const v = name.trim().toLowerCase();
  return !v || v === "unassigned";
}

export function computePriorityScore(
  row: ScoredCandidateWorkflowRow,
  sla: CandidateSlaSnapshot,
): { score: number; reasons: string[] } {
  const result = scoreQueuePriority({ row, sla });
  return {
    score: result.priorityScore,
    reasons: result.priorityReasons,
  };
}

export function buildQueueCandidateRow(
  row: ScoredCandidateWorkflowRow,
  referenceMs = Date.now(),
): QueueCandidateRow {
  const sla = buildCandidateSlaSnapshot({
    appliedDate: row.appliedDate,
    workflowStatus: row.workflowStatus,
    lastActionAt: row.lastActionAt,
    recruitingActions: row.recruitingActions,
    followUpDueAt: row.followUpDueAt,
    snoozedUntil: row.snoozedUntil,
    referenceMs,
  });
  const { score, reasons } = computePriorityScore(row, sla);

  return {
    ...row,
    sla,
    priorityScore: score,
    queueScore: score,
    queueReasons: reasons,
  };
}

export function matchesQueueLane(
  row: QueueCandidateRow,
  lane: CandidateQueueLaneId,
  actingRecruiter: string,
): boolean {
  const recruiter = row.assignedRecruiter.trim();
  const actions = row.recruitingActions;
  const acting = actingRecruiter.trim();

  if (row.sla.isSnoozed && lane === "my-open") return false;

  switch (lane) {
    case "my-open":
      return (
        recruiter === acting &&
        row.workflowStatus !== "Not Qualified" &&
        row.workflowStatus !== "Active Rep"
      );
    case "unassigned":
      return isUnassignedRecruiter(recruiter) && INTAKE_STATUSES.includes(row.workflowStatus);
    case "follow-up-due":
      return (
        actions.needsFollowUp ||
        Boolean(row.followUpDueAt) ||
        row.sla.followUpOverdue
      );
    case "aging-applied":
      return (
        INTAKE_STATUSES.includes(row.workflowStatus) &&
        (row.sla.appliedAgingSeverity === "warn" || row.sla.appliedAgingSeverity === "critical")
      );
    case "paperwork":
      return isPaperworkPendingStatus(row.workflowStatus);
    case "ready-mel":
      return isMelReadyStatus(row.workflowStatus);
    case "training":
      return row.workflowStatus === "Training Needed";
    case "priority":
      return actions.priorityList || row.aiGrade === "A+" || row.aiGrade === "A";
    case "dm-review":
      return actions.dmReview || row.dmNeedsAssignment;
    default:
      return false;
  }
}

/** My-open rows first by priority; other lanes by priorityScore only. */
export function compareQueueRows(
  a: QueueCandidateRow,
  b: QueueCandidateRow,
  lane: CandidateQueueLaneId,
  actingRecruiter: string,
): number {
  if (lane === "my-open") {
    const aOwned = a.assignedRecruiter.trim() === actingRecruiter.trim() ? 1 : 0;
    const bOwned = b.assignedRecruiter.trim() === actingRecruiter.trim() ? 1 : 0;
    if (bOwned !== aOwned) return bOwned - aOwned;
  }
  return b.priorityScore - a.priorityScore || a.candidateId.localeCompare(b.candidateId);
}

export function buildLaneQueue(
  candidates: ScoredCandidateWorkflowRow[],
  lane: CandidateQueueLaneId,
  actingRecruiter: string,
  options?: { limit?: number; referenceMs?: number },
): CandidateActionQueue {
  const referenceMs = options?.referenceMs ?? Date.now();
  const limit = options?.limit ?? 50;
  const queueRows = candidates.map((c) => buildQueueCandidateRow(c, referenceMs));
  const matched = queueRows
    .filter((row) => matchesQueueLane(row, lane, actingRecruiter))
    .sort((a, b) => compareQueueRows(a, b, lane, actingRecruiter));

  return {
    lane,
    rows: matched.slice(0, limit),
    totalInLane: matched.length,
  };
}

export function buildCandidateQueueBoard(
  candidates: ScoredCandidateWorkflowRow[],
  actingRecruiter: string,
  options?: { limitPerLane?: number; referenceMs?: number },
): CandidateQueueBoard {
  const lanes = {} as Record<CandidateQueueLaneId, CandidateActionQueue>;
  for (const lane of CANDIDATE_QUEUE_LANE_ORDER) {
    lanes[lane] = buildLaneQueue(candidates, lane, actingRecruiter, {
      limit: options?.limitPerLane,
      referenceMs: options?.referenceMs,
    });
  }
  return { lanes, actingRecruiter };
}
