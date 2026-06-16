import type {
  ExecutiveAlertFollowUp,
  ExecutiveAlertStatus,
  ExecutiveAlertStatusOverlay,
  FollowUpPriority,
} from "@/lib/alerts/executive-alert-status-types";
import {
  candidateIdFromReEngagementAlertId,
  isReEngagementAlertId,
  reEngagementAlertId,
} from "@/lib/candidate-re-engagement-intelligence/re-engagement-alert-id";
import type { ReEngagementWorkflowAction } from "@/lib/candidate-re-engagement-intelligence/types";

export { reEngagementAlertId, isReEngagementAlertId, candidateIdFromReEngagementAlertId };

export function workflowStatusForOverlay(
  overlay: ExecutiveAlertStatusOverlay | undefined,
): ExecutiveAlertStatus {
  return overlay?.status ?? "new";
}

export function followUpDueForCandidate(
  candidateId: string,
  followUps: ExecutiveAlertFollowUp[],
): string | null {
  const alertId = reEngagementAlertId(candidateId);
  const open = followUps
    .filter((row) => row.alertId === alertId && !row.completedAt)
    .sort((a, b) => Date.parse(a.dueDate) - Date.parse(b.dueDate));
  return open[0]?.dueDate ?? null;
}

export function mapWorkflowActionToStatus(action: ReEngagementWorkflowAction): ExecutiveAlertStatus {
  switch (action) {
    case "contacted":
      return "in-review";
    case "interested":
    case "not-interested":
      return "resolved";
    case "schedule-follow-up":
      return "in-review";
    case "escalate":
      return "in-review";
    default:
      return "in-review";
  }
}

export function workflowNoteForAction(action: ReEngagementWorkflowAction): string | undefined {
  switch (action) {
    case "interested":
      return "Candidate expressed interest";
    case "not-interested":
      return "Candidate not interested";
    case "escalate":
      return "Escalated for recruiter/DM follow-up";
    default:
      return undefined;
  }
}

export function followUpPriorityForAction(action: ReEngagementWorkflowAction): FollowUpPriority {
  if (action === "escalate") return "high";
  if (action === "schedule-follow-up") return "medium";
  return "low";
}

export function mergeReEngagementWorkflowState(input: {
  candidateId: string;
  statusOverlays: ExecutiveAlertStatusOverlay[];
  followUps: ExecutiveAlertFollowUp[];
}): {
  workflowStatus: ExecutiveAlertStatus;
  workflowAlertId: string;
  followUpDueAt: string | null;
} {
  const workflowAlertId = reEngagementAlertId(input.candidateId);
  const overlay = input.statusOverlays.find((row) => row.alertId === workflowAlertId);
  return {
    workflowStatus: workflowStatusForOverlay(overlay),
    workflowAlertId,
    followUpDueAt: followUpDueForCandidate(input.candidateId, input.followUps),
  };
}

export function filterReEngagementFollowUps(
  followUps: ExecutiveAlertFollowUp[],
): ExecutiveAlertFollowUp[] {
  return followUps.filter((row) => isReEngagementAlertId(row.alertId));
}

export function filterReEngagementStatusOverlays(
  overlays: ExecutiveAlertStatusOverlay[],
): ExecutiveAlertStatusOverlay[] {
  return overlays.filter((row) => isReEngagementAlertId(row.alertId));
}
