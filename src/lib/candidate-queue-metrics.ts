import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildCandidateSlaSnapshot,
  isFollowUpOverdue,
  isMelReadyStatus,
  isPaperworkPendingStatus,
} from "@/lib/candidate-action-sla";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";

export type QueueCompactMetrics = {
  overdueFollowUps: number;
  paperworkPending: number;
  readyForMel: number;
  unassigned: number;
};

export function buildQueueCompactMetrics(
  candidates: ScoredCandidateWorkflowRow[],
  referenceMs = Date.now(),
): QueueCompactMetrics {
  let overdueFollowUps = 0;
  let paperworkPending = 0;
  let readyForMel = 0;
  let unassigned = 0;

  for (const row of candidates) {
    const sla = buildCandidateSlaSnapshot({
      appliedDate: row.appliedDate,
      workflowStatus: row.workflowStatus,
      lastActionAt: row.lastActionAt,
      recruitingActions: row.recruitingActions,
      followUpDueAt: row.followUpDueAt,
      snoozedUntil: row.snoozedUntil,
      referenceMs,
    });
    if (
      isFollowUpOverdue({
        recruitingActions: row.recruitingActions,
        followUpDueAt: row.followUpDueAt,
        referenceMs,
      })
    ) {
      overdueFollowUps += 1;
    }
    if (isPaperworkPendingStatus(row.workflowStatus)) paperworkPending += 1;
    if (isMelReadyStatus(row.workflowStatus)) readyForMel += 1;
    if (isUnassignedRecruiter(row.assignedRecruiter)) unassigned += 1;
    void sla;
  }

  return { overdueFollowUps, paperworkPending, readyForMel, unassigned };
}
