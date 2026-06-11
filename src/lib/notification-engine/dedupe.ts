import type { NotificationRuleId } from "@/lib/notification-engine/types";

export function buildNotificationSourceKey(
  ruleId: NotificationRuleId,
  parts: Array<string | null | undefined>,
): string {
  return [ruleId, ...parts.map((part) => (part ?? "").trim().toLowerCase())].join(":");
}
