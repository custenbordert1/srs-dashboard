import type { NotificationSeverity } from "@/lib/notification-engine";

export const NOTIFICATION_SEVERITY_STYLES: Record<NotificationSeverity, string> = {
  critical: "border-l-2 border-l-red-400 border-zinc-800/80 bg-zinc-900/50 text-zinc-100",
  warning: "border-l-2 border-l-amber-400 border-zinc-800/80 bg-zinc-900/50 text-zinc-100",
  info: "border-l-2 border-l-sky-400 border-zinc-800/80 bg-zinc-900/50 text-zinc-100",
};

export const NOTIFICATION_SEVERITY_LABEL: Record<NotificationSeverity, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};
