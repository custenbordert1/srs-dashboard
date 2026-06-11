import type { NotificationSeverity } from "@/lib/notification-engine";

export const NOTIFICATION_SEVERITY_STYLES: Record<NotificationSeverity, string> = {
  critical: "border-red-500/35 bg-red-500/10 text-red-100",
  warning: "border-amber-500/35 bg-amber-500/10 text-amber-100",
  info: "border-sky-500/35 bg-sky-500/10 text-sky-100",
};

export const NOTIFICATION_SEVERITY_LABEL: Record<NotificationSeverity, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};
