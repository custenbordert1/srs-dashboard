"use client";

import {
  NOTIFICATION_SEVERITY_LABEL,
  NOTIFICATION_SEVERITY_STYLES,
} from "@/components/notifications/notification-severity-styles";
import { DataTrustBadge } from "@/components/ui/data-trust-badge";
import { buildDataTrustState } from "@/lib/data-trust-state";
import { fetchWithTimeout, DASHBOARD_REQUEST_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import type {
  AutomationRule,
  NotificationCenterSnapshot,
  NotificationRecord,
  NotificationSeverity,
} from "@/lib/notification-engine";
import { useEffect, useMemo, useState } from "react";

type NotificationsResponse = {
  ok?: boolean;
  center?: NotificationCenterSnapshot;
  meta?: {
    partialSync?: boolean;
    scanMode?: string;
    positionsScanned?: number;
    totalPositionsAvailable?: number;
    refreshedAt?: string;
  };
  error?: string;
};

async function patchNotification(sourceKey: string, action: "read" | "dismiss" | "resolve") {
  await fetchWithTimeout(`/api/notifications/${encodeURIComponent(sourceKey)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
    timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
  });
}

export function NotificationCenter() {
  const [center, setCenter] = useState<NotificationCenterSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<NotificationsResponse["meta"]>();
  const [selectedRecruiter, setSelectedRecruiter] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState<NotificationSeverity | "">("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<NotificationRecord | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (selectedRecruiter) params.set("recruiter", selectedRecruiter);
        if (selectedState) params.append("state", selectedState);
        if (selectedSeverity) params.set("severity", selectedSeverity);
        if (unreadOnly) params.set("unread", "true");
        params.set("includeDismissed", "true");
        const query = params.toString();
        const res = await fetchWithTimeout(`/api/notifications${query ? `?${query}` : ""}`, {
          timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
        });
        const parsed = (await res.json()) as NotificationsResponse;
        if (cancelled) return;
        if (!parsed.ok || !parsed.center) {
          setError(parsed.error ?? "Unable to load notifications.");
          return;
        }
        setError(null);
        setCenter(parsed.center);
        setMeta(parsed.meta);
      } catch {
        if (!cancelled) setError("Unable to load notifications.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRecruiter, selectedState, selectedSeverity, unreadOnly, reloadToken]);

  const trustInput = useMemo(
    () => ({
      hasData: Boolean(center),
      partialSync: meta?.partialSync,
      scanMode: meta?.scanMode,
      positionsScanned: meta?.positionsScanned,
      totalPositionsAvailable: meta?.totalPositionsAvailable,
    }),
    [center, meta],
  );
  const trustState = useMemo(() => buildDataTrustState(trustInput), [trustInput]);

  const visibleNotifications = useMemo(() => {
    if (!center) return [];
    return center.notifications.filter((row) => row.status !== "dismissed" || !unreadOnly);
  }, [center, unreadOnly]);

  const handleAction = async (
    notification: NotificationRecord,
    action: "read" | "dismiss" | "resolve",
  ) => {
    await patchNotification(notification.sourceKey, action);
    setReloadToken((token) => token + 1);
    if (selectedNotification?.sourceKey === notification.sourceKey) {
      setSelectedNotification(null);
    }
  };

  if (loading && !center) {
    return <p className="text-sm text-zinc-500">Loading notification center…</p>;
  }

  if (error && !center) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
        {error}
      </div>
    );
  }

  if (!center) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Notification center</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Proactive alerts for recruiters, DMs, and executives — in-app with email, SMS, and Teams ready.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DataTrustBadge trust={trustInput} state={trustState} />
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setReloadToken((token) => token + 1);
            }}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Generated", value: center.metrics.alertsGenerated },
          { label: "Unread", value: center.metrics.unreadCount },
          { label: "Critical active", value: center.metrics.activeCriticalAlerts },
          { label: "Resolved", value: center.metrics.alertsResolved },
          {
            label: "Avg resolution (h)",
            value: center.metrics.avgResolutionTimeHours ?? "—",
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3"
          >
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">{kpi.label}</p>
            <p className="mt-1 text-lg font-semibold text-zinc-100">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <label className="text-xs text-zinc-400">
          Territory
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="ml-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
          >
            <option value="">All</option>
            {center.filterOptions.territoryStates.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          Recruiter
          <select
            value={selectedRecruiter}
            onChange={(e) => setSelectedRecruiter(e.target.value)}
            className="ml-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
          >
            <option value="">All</option>
            {center.filterOptions.recruiters.map((recruiter) => (
              <option key={recruiter} value={recruiter}>
                {recruiter}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-400">
          Severity
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value as NotificationSeverity | "")}
            className="ml-2 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
          >
            <option value="">All</option>
            {center.filterOptions.severities.map((severity) => (
              <option key={severity} value={severity}>
                {NOTIFICATION_SEVERITY_LABEL[severity]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="rounded border-zinc-600"
          />
          Unread only
        </label>
        <button
          type="button"
          onClick={() => setShowRules((open) => !open)}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          {showRules ? "Hide rules" : "Automation rules"}
        </button>
      </div>

      {showRules ? <AutomationRulesTable rules={center.rules} /> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="space-y-2 lg:col-span-2">
          {visibleNotifications.length === 0 ? (
            <p className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 text-sm text-zinc-500">
              No notifications match the current filters.
            </p>
          ) : (
            visibleNotifications.map((notification) => (
              <article
                key={notification.id}
                className={`rounded-xl border p-4 transition-colors ${
                  notification.status === "active"
                    ? NOTIFICATION_SEVERITY_STYLES[notification.severity]
                    : "border-zinc-800/80 bg-zinc-900/40 text-zinc-300"
                } ${selectedNotification?.id === notification.id ? "ring-1 ring-teal-500/40" : ""}`}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setSelectedNotification(notification)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
                      {NOTIFICATION_SEVERITY_LABEL[notification.severity]}
                    </span>
                    <span className="font-medium">{notification.title}</span>
                    {notification.status !== "active" ? (
                      <span className="rounded-full border border-zinc-600 px-2 py-0.5 text-[10px] uppercase">
                        {notification.status}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm opacity-90">{notification.message}</p>
                  <p className="mt-2 text-[10px] uppercase tracking-wide opacity-60">
                    {notification.audience}
                    {notification.recruiterName ? ` · ${notification.recruiterName}` : ""}
                    {notification.dmName ? ` · ${notification.dmName}` : ""}
                  </p>
                </button>
                <div className="mt-3 flex flex-wrap gap-2">
                  {notification.status === "active" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleAction(notification, "read")}
                        className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800/60"
                      >
                        Mark read
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleAction(notification, "dismiss")}
                        className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800/60"
                      >
                        Dismiss
                      </button>
                    </>
                  ) : null}
                  {notification.status !== "resolved" && notification.status !== "dismissed" ? (
                    <button
                      type="button"
                      onClick={() => void handleAction(notification, "resolve")}
                      className="rounded border border-teal-600/40 px-2 py-1 text-xs text-teal-200 hover:bg-teal-500/10"
                    >
                      Resolve
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </section>

        <aside className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-100">Audit history</h3>
          {selectedNotification ? (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-zinc-400">{selectedNotification.title}</p>
              {selectedNotification.auditHistory.length === 0 ? (
                <p className="text-xs text-zinc-500">No audit entries yet for this notification.</p>
              ) : (
                <ul className="space-y-2 text-xs text-zinc-300">
                  {selectedNotification.auditHistory.map((entry) => (
                    <li key={entry.id} className="rounded border border-zinc-800/80 px-2 py-1.5">
                      <span className="font-medium">{entry.action}</span>
                      <span className="text-zinc-500"> · {entry.actorUserName}</span>
                      <p className="text-zinc-500">{new Date(entry.at).toLocaleString()}</p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[10px] text-zinc-600">
                Channels: {selectedNotification.channels.join(", ")}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-xs text-zinc-500">Select a notification to view audit history.</p>
          )}
        </aside>
      </div>

      {meta?.refreshedAt ? (
        <p className="text-xs text-zinc-600">
          Refreshed {new Date(meta.refreshedAt).toLocaleString()}
        </p>
      ) : null}
    </div>
  );
}

function AutomationRulesTable({ rules }: { rules: AutomationRule[] }) {
  return (
    <section className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">Automation rules engine</h3>
      <table className="mt-3 min-w-full text-left text-xs">
        <thead className="uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-2 py-2">Rule</th>
            <th className="px-2 py-2">Trigger</th>
            <th className="px-2 py-2">Condition</th>
            <th className="px-2 py-2">Action</th>
            <th className="px-2 py-2">Severity</th>
            <th className="px-2 py-2">Recipient</th>
            <th className="px-2 py-2">Channels</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/80 text-zinc-300">
          {rules.map((rule) => (
            <tr key={rule.id}>
              <td className="px-2 py-2 font-medium text-zinc-100">{rule.label}</td>
              <td className="px-2 py-2">{rule.trigger}</td>
              <td className="px-2 py-2">{rule.condition}</td>
              <td className="px-2 py-2">{rule.action}</td>
              <td className="px-2 py-2">{NOTIFICATION_SEVERITY_LABEL[rule.severity]}</td>
              <td className="px-2 py-2">{rule.recipient}</td>
              <td className="px-2 py-2">{rule.channels.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
