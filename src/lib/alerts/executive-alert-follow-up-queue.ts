import type { ExecutiveAlert } from "@/lib/alerts/alert-types";
import type {
  ExecutiveAlertFollowUp,
  ExecutiveAlertStatus,
} from "@/lib/alerts/executive-alert-status-types";
import { FOLLOW_UP_PRIORITY_LABELS } from "@/lib/alerts/executive-alert-status-types";

export type ExecutiveAlertFollowUpQueueItem = {
  followUp: ExecutiveAlertFollowUp;
  alert: ExecutiveAlert;
  status: ExecutiveAlertStatus;
  storeLabel: string;
  isOverdue: boolean;
};

const PRIORITY_SORT: Record<ExecutiveAlertFollowUp["priority"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function isFollowUpOverdue(dueDate: string, referenceMs = Date.now()): boolean {
  const due = Date.parse(dueDate);
  if (Number.isNaN(due)) return false;
  const endOfDueDay = new Date(dueDate);
  endOfDueDay.setHours(23, 59, 59, 999);
  return endOfDueDay.getTime() < referenceMs;
}

export function resolveFollowUpStoreLabel(alert: ExecutiveAlert): string {
  return (
    alert.context?.storeName ??
    alert.context?.projectName ??
    alert.title
  );
}

export function buildExecutiveAlertFollowUpQueue(
  alerts: ExecutiveAlert[],
  followUps: ExecutiveAlertFollowUp[],
  statusByAlertId: Record<string, ExecutiveAlertStatus>,
  referenceMs = Date.now(),
): ExecutiveAlertFollowUpQueueItem[] {
  const alertById = new Map(alerts.map((alert) => [alert.id, alert]));

  return followUps
    .map((followUp) => {
      const alert = alertById.get(followUp.alertId);
      if (!alert) return null;
      return {
        followUp,
        alert,
        status: statusByAlertId[followUp.alertId] ?? "new",
        storeLabel: resolveFollowUpStoreLabel(alert),
        isOverdue: isFollowUpOverdue(followUp.dueDate, referenceMs),
      };
    })
    .filter((row): row is ExecutiveAlertFollowUpQueueItem => row != null)
    .sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      const priorityDelta =
        PRIORITY_SORT[a.followUp.priority] - PRIORITY_SORT[b.followUp.priority];
      if (priorityDelta !== 0) return priorityDelta;
      return Date.parse(a.followUp.dueDate) - Date.parse(b.followUp.dueDate);
    });
}

export function formatFollowUpDueLabel(dueDate: string, isOverdue: boolean): string {
  const label = new Date(dueDate).toLocaleDateString();
  return isOverdue ? `${label} · Overdue` : label;
}

export function followUpOwnerLabel(followUp: ExecutiveAlertFollowUp): string {
  const kind = followUp.ownerKind === "dm" ? "DM" : "Recruiter";
  return `${kind} · ${followUp.ownerName}`;
}

export function followUpPriorityLabel(priority: ExecutiveAlertFollowUp["priority"]): string {
  return FOLLOW_UP_PRIORITY_LABELS[priority];
}
