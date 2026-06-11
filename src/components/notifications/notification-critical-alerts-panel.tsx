"use client";

import {
  NOTIFICATION_SEVERITY_LABEL,
  NOTIFICATION_SEVERITY_STYLES,
} from "@/components/notifications/notification-severity-styles";
import { fetchWithTimeout, DASHBOARD_REQUEST_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import type { NotificationCenterSnapshot, NotificationRecord } from "@/lib/notification-engine";
import { navigateRecruitingTab } from "@/lib/recruiting-tab-navigation";
import { useEffect, useState } from "react";

type NotificationsResponse = {
  ok?: boolean;
  center?: NotificationCenterSnapshot;
  error?: string;
};

type NotificationCriticalAlertsPanelProps = {
  title?: string;
  description?: string;
  limit?: number;
  compact?: boolean;
};

export function NotificationCriticalAlertsPanel({
  title = "Critical alerts",
  description = "Proactive notifications requiring immediate attention.",
  limit = 5,
  compact = false,
}: NotificationCriticalAlertsPanelProps) {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout("/api/notifications?unread=true", {
          timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
        });
        const parsed = (await res.json()) as NotificationsResponse;
        if (cancelled) return;
        if (!parsed.ok || !parsed.center) {
          setError(parsed.error ?? "Unable to load notifications.");
          return;
        }
        setError(null);
        const critical = parsed.center.notifications
          .filter((row) => row.severity === "critical" && row.status === "active")
          .slice(0, limit);
        setNotifications(critical);
        setUnreadCount(parsed.center.metrics.unreadCount);
      } catch {
        if (!cancelled) setError("Unable to load notifications.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  if (loading) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <p className="text-sm text-zinc-500">Loading critical alerts…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-100">
        {error}
      </section>
    );
  }

  if (notifications.length === 0) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-zinc-50">{title}</h3>
            {!compact ? <p className="mt-1 text-xs text-zinc-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => navigateRecruitingTab({ tab: "notifications" })}
            className="text-xs text-teal-300 hover:text-teal-200"
          >
            Notification center
          </button>
        </div>
        <p className="mt-3 text-sm text-zinc-500">No critical alerts right now.</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-zinc-50">{title}</h3>
          {!compact ? <p className="mt-1 text-xs text-zinc-500">{description}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 ? (
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-100">
              {unreadCount} unread
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => navigateRecruitingTab({ tab: "notifications" })}
            className="text-xs text-teal-300 hover:text-teal-200"
          >
            View all
          </button>
        </div>
      </div>
      <ul className="space-y-2">
        {notifications.map((row) => (
          <li
            key={row.id}
            className={`rounded-lg border px-3 py-2 text-sm ${NOTIFICATION_SEVERITY_STYLES[row.severity]}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                {NOTIFICATION_SEVERITY_LABEL[row.severity]}
              </span>
              <span className="font-medium">{row.title}</span>
            </div>
            <p className="mt-1 text-xs opacity-90">{row.message}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
