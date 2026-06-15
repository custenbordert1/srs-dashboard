import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildQueueCandidateRow,
  isUnassignedRecruiter,
  type QueueCandidateRow,
} from "@/lib/candidate-action-queue";
import {
  isMelReadyStatus,
  isPaperworkPendingStatus,
} from "@/lib/candidate-action-sla";
import type { CandidateWorkflowStatus } from "@/lib/candidate-workflow-types";
import type { WorkNextTierId } from "@/lib/guided-recruiting-workflow/types";

const INTAKE_STATUSES: CandidateWorkflowStatus[] = ["Applied", "Needs Review"];

export const WORK_NEXT_TIER_ORDER: WorkNextTierId[] = [
  "ready-mel",
  "paperwork-pending",
  "follow-up-due",
  "unassigned",
  "aging",
];

export function resolveWorkNextTier(row: QueueCandidateRow): WorkNextTierId | null {
  if (isMelReadyStatus(row.workflowStatus)) return "ready-mel";
  if (isPaperworkPendingStatus(row.workflowStatus)) return "paperwork-pending";
  if (
    row.recruitingActions.needsFollowUp ||
    row.followUpDueAt ||
    row.sla.followUpOverdue
  ) {
    return "follow-up-due";
  }
  if (isUnassignedRecruiter(row.assignedRecruiter) && INTAKE_STATUSES.includes(row.workflowStatus)) {
    return "unassigned";
  }
  if (
    INTAKE_STATUSES.includes(row.workflowStatus) &&
    (row.sla.appliedAgingSeverity === "warn" || row.sla.appliedAgingSeverity === "critical")
  ) {
    return "aging";
  }
  return null;
}

function tierRank(tier: WorkNextTierId | null): number {
  if (!tier) return WORK_NEXT_TIER_ORDER.length;
  return WORK_NEXT_TIER_ORDER.indexOf(tier);
}

function isOwnedByActing(row: QueueCandidateRow, actingRecruiter: string): boolean {
  return row.assignedRecruiter.trim() === actingRecruiter.trim();
}

export function pickWorkNextCandidate(
  candidates: ScoredCandidateWorkflowRow[],
  actingRecruiter: string,
  options?: { referenceMs?: number; skippedCandidateIds?: string[] },
): QueueCandidateRow | null {
  const referenceMs = options?.referenceMs ?? Date.now();
  const skipped = new Set(options?.skippedCandidateIds ?? []);
  const queueRows = candidates
    .map((row) => buildQueueCandidateRow(row, referenceMs))
    .filter((row) => !skipped.has(row.candidateId))
    .filter(
      (row) =>
        row.workflowStatus !== "Not Qualified" &&
        row.workflowStatus !== "Active Rep" &&
        row.workflowStatus !== "Loaded in MEL" &&
        !row.sla.isSnoozed,
    )
    .filter((row) => {
      const tier = resolveWorkNextTier(row);
      if (!tier) return false;
      if (tier === "unassigned") return true;
      return isOwnedByActing(row, actingRecruiter);
    });

  if (queueRows.length === 0) return null;

  queueRows.sort((a, b) => {
    const tierDiff = tierRank(resolveWorkNextTier(a)) - tierRank(resolveWorkNextTier(b));
    if (tierDiff !== 0) return tierDiff;
    const ownedDiff = Number(isOwnedByActing(b, actingRecruiter)) - Number(isOwnedByActing(a, actingRecruiter));
    if (ownedDiff !== 0) return ownedDiff;
    return b.priorityScore - a.priorityScore || a.candidateId.localeCompare(b.candidateId);
  });

  return queueRows[0] ?? null;
}
