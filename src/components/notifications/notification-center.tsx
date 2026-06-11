"use client";

import {
  NOTIFICATION_SEVERITY_LABEL,
  NOTIFICATION_SEVERITY_STYLES,
} from "@/components/notifications/notification-severity-styles";
import { ExecutiveKpiCard, ExecutiveKpiGrid } from "@/components/ui/executive-kpi-card";
import { fetchWithTimeout, DASHBOARD_REQUEST_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import type {
  AutomationRule,
  NotificationCenterSnapshot,
  NotificationRecord,
  NotificationSeverity,
} from "@/lib/notification-engine";
import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 25;

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
  const [selectedRecruiter, setSelectedRecruiter] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState<NotificationSeverity | "">("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [showRules, setShowRules] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<NotificationRecord | null>(null);
  const [page, setPage] = useState(0);
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

  const visibleNotifications = useMemo(() => {
    if (!center) return [];
    const needle = search.trim().toLowerCase();
    return center.notifications
      .filter((row) => row.status !== "dismissed" || !unreadOnly)
      .filter((row) => {
        if (!needle) return true;
        return (
          row.title.toLowerCase().includes(needle) ||
          row.message.toLowerCase().includes(needle) ||
          (row.recruiterName?.toLowerCase().includes(needle) ?? false) ||
          (row.dmName?.toLowerCase().includes(needle) ?? false)
        );
      });
  }, [center, unreadOnly, search]);

  const summaryCounts = useMemo(() => {
    const active = visibleNotifications.filter((row) => row.status === "active");
    return {
      critical: active.filter((row) => row.severity === "critical").length,
      high: active.filter((row) => row.severity === "warning").length,
      medium: active.filter((row) => row.severity === "info").length,
      resolved: visibleNotifications.filter((row) => row.status === "resolved").length,
    };
  }, [visibleNotifications]);

  const pageCount = Math.max(1, Math.ceil(visibleNotifications.length / PAGE_SIZE));
  const pagedNotifications = visibleNotifications.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [search, selectedRecruiter, selectedState, selectedSeverity, unreadOnly]);

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
    return <p className="text-sm text-zinc-500">Loading notifications…</p>;
  }

  if (error && !center) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-200">
        {error}
      </div>
    );
  }

  if (!center) return null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Notifications</h2>
          <p className="text-xs text-zinc-500">Priority alerts for recruiters, DMs, and leadership</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setReloadToken((token) => token + 1);
          }}
          className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Refresh
        </button>
      </header>

      <ExecutiveKpiGrid columns={4}>
        <ExecutiveKpiCard label="Critical" value={String(summaryCounts.critical)} tone="critical" />
        <ExecutiveKpiCard label="High" value={String(summaryCounts.high)} tone="warning" />
        <ExecutiveKpiCard label="Medium" value={String(summaryCounts.medium)} tone="info" />
        <ExecutiveKpiCard label="Resolved" value={String(summaryCounts.resolved)} tone="healthy" />
      </ExecutiveKpiGrid>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3">
        <label className="min-w-[160px] flex-1 text-xs text-zinc-400">
          Search
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Title, recruiter, DM…"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
          />
        </label>
        <label className="text-xs text-zinc-400">
          Territory
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="ml-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
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
          Severity
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value as NotificationSeverity | "")}
            className="ml-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
          >
            <option value="">All</option>
            {center.filterOptions.severities.map((severity) => (
              <option key={severity} value={severity}>
                {NOTIFICATION_SEVERITY_LABEL[severity]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(e) => setUnreadOnly(e.target.checked)}
            className="rounded border-zinc-600"
          />
          Unread
        </label>
        <button
          type="button"
          onClick={() => setShowRules((open) => !open)}
          className="rounded-lg border border-zinc-700 px-2 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
        >
          {showRules ? "Hide rules" : "Rules"}
        </button>
      </div>

      {showRules ? <AutomationRulesTable rules={center.rules} /> : null}

      <section className="space-y-2">
        {pagedNotifications.length === 0 ? (
          <p className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 px-4 py-3 text-sm text-zinc-500">
            No notifications match the current filters.
          </p>
        ) : (
          pagedNotifications.map((notification) => (
            <article
              key={notification.id}
              className={`rounded-lg border px-3 py-2.5 ${
                notification.status === "active"
                  ? NOTIFICATION_SEVERITY_STYLES[notification.severity]
                  : "border-zinc-800/80 bg-zinc-900/30 text-zinc-400"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() =>
                    setSelectedNotification((current) =>
                      current?.id === notification.id ? null : notification,
                    )
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      {NOTIFICATION_SEVERITY_LABEL[notification.severity]}
                    </span>
                    <span className="text-sm font-medium text-zinc-100">{notification.title}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">{notification.message}</p>
                </button>
                <div className="flex shrink-0 flex-wrap gap-1">
                  {notification.status === "active" ? (
                    <>
                      <ActionChip label="Read" onClick={() => void handleAction(notification, "read")} />
                      <ActionChip label="Dismiss" onClick={() => void handleAction(notification, "dismiss")} />
                    </>
                  ) : null}
                  {notification.status !== "resolved" && notification.status !== "dismissed" ? (
                    <ActionChip
                      label="Resolve"
                      primary
                      onClick={() => void handleAction(notification, "resolve")}
                    />
                  ) : null}
                </div>
              </div>
              {selectedNotification?.id === notification.id ? (
                <div className="mt-2 border-t border-zinc-800/60 pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Audit history</p>
                  {notification.auditHistory.length === 0 ? (
                    <p className="mt-1 text-xs text-zinc-600">No audit entries yet.</p>
                  ) : (
                    <ul className="mt-1 space-y-1 text-xs text-zinc-400">
                      {notification.auditHistory.map((entry) => (
                        <li key={entry.id}>
                          {entry.action} · {entry.actorUserName} · {new Date(entry.at).toLocaleString()}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </article>
          ))
        )}
      </section>

      {visibleNotifications.length > PAGE_SIZE ? (
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, visibleNotifications.length)} of{" "}
            {visibleNotifications.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded border border-zinc-700 px-2 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="rounded border border-zinc-700 px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActionChip({
  label,
  onClick,
  primary = false,
}: {
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        primary
          ? "rounded border border-teal-600/40 px-2 py-0.5 text-[10px] text-teal-200 hover:bg-teal-500/10"
          : "rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-800"
      }
    >
      {label}
    </button>
  );
}

function AutomationRulesTable({ rules }: { rules: AutomationRule[] }) {
  if (rules.length === 0) return null;
  return (
    <section className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3">
      <h3 className="text-xs font-semibold text-zinc-300">Automation rules</h3>
      <table className="mt-2 min-w-full text-left text-[11px]">
        <thead className="uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-2 py-1">Rule</th>
            <th className="px-2 py-1">Trigger</th>
            <th className="px-2 py-1">Severity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/80 text-zinc-400">
          {rules.map((rule) => (
            <tr key={rule.id}>
              <td className="px-2 py-1.5 text-zinc-200">{rule.label}</td>
              <td className="px-2 py-1.5">{rule.trigger}</td>
              <td className="px-2 py-1.5">{NOTIFICATION_SEVERITY_LABEL[rule.severity]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
