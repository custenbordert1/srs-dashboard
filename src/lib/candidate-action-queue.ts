import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildCandidateSlaSnapshot,
  isMelReadyStatus,
  isPaperworkPendingStatus,
  type CandidateSlaSnapshot,
  type SlaSeverity,
} from "@/lib/candidate-action-sla";
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

function gradeBoost(grade: string): number {
  if (grade === "A+") return 24;
  if (grade === "A") return 18;
  if (grade === "B") return 8;
  return 0;
}

function slaBoost(severity: SlaSeverity): number {
  if (severity === "critical") return 20;
  if (severity === "warn") return 10;
  return 0;
}

export function computePriorityScore(
  row: ScoredCandidateWorkflowRow,
  sla: CandidateSlaSnapshot,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = row.aiNumericScore + gradeBoost(row.aiGrade);

  if (row.recruitingActions.priorityList) {
    score += 30;
    reasons.push("Priority list");
  }
  if (row.recruitingActions.dmReview) {
    score += 8;
    reasons.push("DM review");
  }
  if (row.recruitingActions.recommendInterview) {
    score += 10;
    reasons.push("Interview flagged");
  }
  if (row.recruitingActions.onboardingPacketPrep) {
    score += 6;
    reasons.push("Onboarding prep");
  }
  if (row.recruitingActions.needsFollowUp || row.followUpDueAt) {
    score += sla.followUpOverdue ? 28 : 16;
    reasons.push(sla.followUpOverdue ? "Follow-up overdue" : "Follow-up scheduled");
  }
  if (sla.appliedAgingSeverity !== "none") {
    score += slaBoost(sla.appliedAgingSeverity);
    reasons.push(`Applied ${sla.appliedDays ?? "?"}d`);
  }
  if (sla.paperworkAgingSeverity !== "none") {
    score += slaBoost(sla.paperworkAgingSeverity);
    reasons.push("Paperwork waiting");
  }
  if (isMelReadyStatus(row.workflowStatus)) {
    score += 14;
    reasons.push("MEL ready");
  }
  if (sla.recruiterInactivitySeverity !== "none") {
    score += slaBoost(sla.recruiterInactivitySeverity);
    reasons.push(`Inactive ${sla.statusDays ?? "?"}d`);
  }
  if (row.isTopMatch) {
    score += 12;
    reasons.push("Top match");
  }
  if (row.dmNeedsAssignment) {
    score += 6;
    reasons.push(`DM suggest ${row.suggestedDM}`);
  }

  return {
    score,
    reasons: reasons.length > 0 ? reasons : [row.nextActionNeeded],
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
