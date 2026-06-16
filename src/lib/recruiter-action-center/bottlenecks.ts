import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  hoursSince,
  isFollowUpOverdue,
  isMelReadyStatus,
  isPaperworkPendingStatus,
} from "@/lib/candidate-action-sla";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { BottleneckBadgeId } from "@/lib/recruiter-action-center/types";

const INTERVIEW_STATUSES = new Set(["Qualified", "Training Needed"]);

export function detectCandidateBottlenecks(
  row: ScoredCandidateWorkflowRow,
  referenceMs: number,
): BottleneckBadgeId[] {
  const badges: BottleneckBadgeId[] = [];
  const touchHours = hoursSince(row.lastActionAt ?? row.appliedDate, referenceMs);

  if (touchHours !== null && touchHours >= 48) {
    badges.push("no-touch-48h");
  } else if (touchHours !== null && touchHours >= 24) {
    badges.push("no-touch-24h");
  }

  if (isPaperworkPendingStatus(row.workflowStatus)) {
    const paperworkHours = hoursSince(row.lastActionAt ?? row.appliedDate, referenceMs);
    if (paperworkHours !== null && paperworkHours >= 48) {
      badges.push("paperwork-pending-48h");
    }
  }

  if (INTERVIEW_STATUSES.has(row.workflowStatus)) {
    const stageHours = hoursSince(row.lastActionAt ?? row.appliedDate, referenceMs);
    if (stageHours !== null && stageHours >= 72) {
      badges.push("interview-too-long");
    }
  }

  if (isMelReadyStatus(row.workflowStatus) && row.workflowStatus !== "Loaded in MEL") {
    badges.push("ready-mel-not-submitted");
  }

  if (!isUnassignedRecruiter(row.assignedRecruiter)) {
    const workedHours = hoursSince(row.lastActionAt, referenceMs);
    if (workedHours !== null && workedHours >= 48) {
      badges.push("assigned-not-worked");
    }
  }

  if (
    isFollowUpOverdue({
      recruitingActions: row.recruitingActions,
      followUpDueAt: row.followUpDueAt,
      referenceMs,
    })
  ) {
    badges.push("follow-up-overdue");
  }

  return badges;
}

export const BOTTLENECK_BADGE_LABELS: Record<BottleneckBadgeId, string> = {
  "no-touch-24h": "No touch 24+",
  "no-touch-48h": "No touch 48+",
  "paperwork-pending-48h": "Paperwork 48+",
  "interview-too-long": "Interview too long",
  "ready-mel-not-submitted": "Ready MEL not submitted",
  "assigned-not-worked": "Assigned not worked",
  "follow-up-overdue": "Follow-up overdue",
};
