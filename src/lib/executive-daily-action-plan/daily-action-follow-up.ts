import type { FollowUpOwnerKind, FollowUpPriority } from "@/lib/alerts/executive-alert-status-types";
import type { DailyActionPlanItem } from "@/lib/executive-daily-action-plan/types";

export type DailyActionFollowUpPayload = {
  alertId: string;
  ownerKind: FollowUpOwnerKind;
  ownerName: string;
  dueDate: string;
  priority: FollowUpPriority;
  notes: string;
};

export function buildFollowUpPayloadFromDailyAction(
  item: DailyActionPlanItem,
): DailyActionFollowUpPayload {
  const ownerKind: FollowUpOwnerKind =
    item.ownerKind === "recruiter" ? "recruiter" : "dm";
  const priority: FollowUpPriority =
    item.expectedImpact >= 70 ? "critical" : item.expectedImpact >= 50 ? "high" : "medium";

  return {
    alertId: item.alertId,
    ownerKind,
    ownerName: item.owner,
    dueDate: item.dueDate,
    priority,
    notes: `${item.title} · ${item.reasoning}`,
  };
}
