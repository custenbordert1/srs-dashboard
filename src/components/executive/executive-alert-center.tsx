"use client";

import { ExecutiveAlertDetailDrawer } from "@/components/executive/executive-alert-detail-drawer";
import {
  ExecutiveAlertFollowUpQueue,
} from "@/components/executive/executive-alert-follow-up-queue";
import { WorkspaceEmptyState } from "@/components/ui/workspace-empty-state";
import { WorkspacePageShell } from "@/components/ui/workspace-page-shell";
import type {
  AlertCategory,
  AlertSeverity,
  ExecutiveAlert,
} from "@/lib/alerts/alert-types";
import { ACTION_LABELS } from "@/lib/alerts/executive-alert-labels";
import type { ExecutiveAlertAssigneeOptions } from "@/lib/alerts/build-executive-alert-assignees";
import { buildExecutiveAlertFollowUpQueue } from "@/lib/alerts/executive-alert-follow-up-queue";
import { resolveExecutiveAlertDrawer } from "@/lib/alerts/executive-alert-drawer";
import {
  DEFAULT_EXECUTIVE_ALERT_FILTERS,
  filterExecutiveAlerts,
  listExecutiveAlertTerritories,
  mergeAlertStatuses,
  type ExecutiveAlertFilterState,
  type ExecutiveAlertWithStatus,
} from "@/lib/alerts/executive-alert-filters";
import {
  mergeLocalAndServerStatuses,
  readLocalExecutiveAlertStatuses,
  writeLocalExecutiveAlertStatus,
} from "@/lib/alerts/executive-alert-status-client";
import {
  EXECUTIVE_ALERT_STATUS_LABELS,
  type ExecutiveAlertActionLogEntry,
  type ExecutiveAlertFollowUp,
  type ExecutiveAlertStatus,
  type FollowUpOwnerKind,
  type FollowUpPriority,
} from "@/lib/alerts/executive-alert-status-types";
import {
  buildPlacementContextFromAlert,
} from "@/lib/alerts/placement-alert-navigation";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
import { navigateRecruitingTab } from "@/lib/recruiting-tab-navigation";
import type { RecruitingIntelligenceCacheMeta } from "@/lib/recruiting-intelligence/recruiting-intelligence-types";
import { UI_BADGE, UI_BUTTON, UI_INPUT, UI_LAYOUT, UI_RISK, UI_SPACE, UI_SURFACE, UI_TYPE } from "@/lib/ui-tokens";
import { useCallback, useEffect, useMemo, useState } from "react";

type ExecutiveAlertView = "alerts" | "follow-up-queue";

type ExecutiveAlertsResponse = {
  ok?: boolean;
  error?: string;
  alerts?: ExecutiveAlert[];
  topActions?: ExecutiveAlertWithStatus[];
  topCritical?: ExecutiveAlertWithStatus[];
  criticalAlerts?: ExecutiveAlertWithStatus[];
  highAlerts?: ExecutiveAlertWithStatus[];
  generatedAt?: string;
  statusOverlays?: Array<{
    alertId: string;
    userId: string;
    status: ExecutiveAlertStatus;
    updatedAt: string;
    snoozedUntil?: string | null;
    note?: string;
  }>;
  actionLogs?: ExecutiveAlertActionLogEntry[];
  followUps?: ExecutiveAlertFollowUp[];
  assigneeOptions?: ExecutiveAlertAssigneeOptions;
  notesByAlertId?: Record<string, string>;
  meta?: {
    totalCount: number;
    byCategory: Record<AlertCategory, number>;
    bySeverity: Record<AlertSeverity, number>;
    intelligenceCacheStatus?: string;
  };
  intelligenceCache?: RecruitingIntelligenceCacheMeta;
};

const SEVERITY_STYLES: Record<AlertSeverity, string> = {
  critical: UI_RISK.critical,
  high: UI_RISK.atRisk,
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  low: "border-zinc-700/80 bg-zinc-900/40 text-zinc-300",
};

const STATUS_BADGE: Record<ExecutiveAlertStatus, string> = {
  new: "border-sky-500/30 bg-sky-500/10 text-sky-100",
  "in-review": "border-amber-500/30 bg-amber-500/10 text-amber-100",
  snoozed: "border-zinc-600/50 bg-zinc-800/60 text-zinc-300",
  resolved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
};

function snoozeUntilIso(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

function AlertCard({
  alert,
  onOpenDrawer,
  onNavigate,
}: {
  alert: ExecutiveAlertWithStatus;
  onOpenDrawer: (alert: ExecutiveAlertWithStatus) => void;
  onNavigate: (alert: ExecutiveAlertWithStatus) => void;
}) {
  return (
    <article className={`rounded-xl border p-4 ${SEVERITY_STYLES[alert.severity]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${UI_BADGE.critical}`}>
              {alert.severity}
            </span>
            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_BADGE[alert.status]}`}>
              {EXECUTIVE_ALERT_STATUS_LABELS[alert.status]}
            </span>
            <span className="rounded bg-zinc-950/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
              {alert.category}
            </span>
            <span className="text-[10px] font-semibold tabular-nums text-zinc-300">
              Impact {alert.impactScore}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-zinc-50">{alert.title}</h3>
          <p className="text-sm text-zinc-300">{alert.description}</p>
          <p className="text-xs text-zinc-500">{alert.reason}</p>
          {alert.context?.dmName ? (
            <p className="text-xs text-zinc-500">Territory · {alert.context.dmName}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <button type="button" className={UI_BUTTON.primary} onClick={() => onOpenDrawer(alert)}>
            {ACTION_LABELS[alert.recommendedAction]}
          </button>
          <button type="button" className={UI_BUTTON.secondary} onClick={() => onNavigate(alert)}>
            Go to {alert.destination.label}
          </button>
        </div>
      </div>
    </article>
  );
}

function AlertSection({
  title,
  subtitle,
  alerts,
  emptyMessage,
  onOpenDrawer,
  onNavigate,
}: {
  title: string;
  subtitle: string;
  alerts: ExecutiveAlertWithStatus[];
  emptyMessage: string;
  onOpenDrawer: (alert: ExecutiveAlertWithStatus) => void;
  onNavigate: (alert: ExecutiveAlertWithStatus) => void;
}) {
  return (
    <section className={UI_SPACE.section}>
      <div>
        <h2 className={UI_TYPE.sectionTitle}>{title}</h2>
        <p className={UI_TYPE.sectionSubtitle}>{subtitle}</p>
      </div>
      {alerts.length === 0 ? (
        <WorkspaceEmptyState title={emptyMessage} message="No matching alerts in this section." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onOpenDrawer={onOpenDrawer}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function ExecutiveAlertCenter() {
  const [data, setData] = useState<ExecutiveAlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ExecutiveAlertView>("alerts");
  const [filters, setFilters] = useState<ExecutiveAlertFilterState>(DEFAULT_EXECUTIVE_ALERT_FILTERS);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [statusByAlertId, setStatusByAlertId] = useState<Record<string, ExecutiveAlertStatus>>({});
  const [actionLogs, setActionLogs] = useState<ExecutiveAlertActionLogEntry[]>([]);
  const [followUps, setFollowUps] = useState<ExecutiveAlertFollowUp[]>([]);
  const [notesByAlertId, setNotesByAlertId] = useState<Record<string, string>>({});
  const [assigneeOptions, setAssigneeOptions] = useState<ExecutiveAlertAssigneeOptions>({
    dms: [],
    recruiters: [],
  });

  const applyStatusOverlays = useCallback(
    (alerts: ExecutiveAlert[], overlays: ExecutiveAlertsResponse["statusOverlays"] = []) => {
      const userId = overlays?.[0]?.userId ?? "local";
      const local = readLocalExecutiveAlertStatuses(userId);
      const merged = mergeLocalAndServerStatuses(local, overlays ?? []);
      const withStatus = mergeAlertStatuses(alerts, merged);
      setStatusByAlertId(Object.fromEntries(withStatus.map((row) => [row.id, row.status])));
      return withStatus;
    },
    [],
  );

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const params = force ? "?forceRefresh=1" : "";
      const response = await fetchWithTimeout(`/api/executive-alerts${params}`, {
        cache: "no-store",
        timeoutMs: FETCH_T4_INTELLIGENCE_MS,
      });
      const parsed = (await response.json()) as ExecutiveAlertsResponse;
      if (!response.ok || !parsed.ok) {
        throw new Error(parsed.error ?? "Failed to load executive alerts");
      }
      const alertsWithStatus = applyStatusOverlays(parsed.alerts ?? [], parsed.statusOverlays);
      setActionLogs(parsed.actionLogs ?? []);
      setFollowUps(parsed.followUps ?? []);
      setNotesByAlertId(parsed.notesByAlertId ?? {});
      setAssigneeOptions(parsed.assigneeOptions ?? { dms: [], recruiters: [] });
      setData({
        ...parsed,
        alerts: alertsWithStatus,
        topCritical: mergeAlertStatuses(parsed.topCritical ?? [], parsed.statusOverlays ?? []),
        topActions: mergeAlertStatuses(parsed.topActions ?? [], parsed.statusOverlays ?? []),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load executive alerts");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyStatusOverlays]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const alertsWithStatus = useMemo(() => {
    const base = data?.alerts ?? [];
    return base.map((alert) => ({
      ...alert,
      status: statusByAlertId[alert.id] ?? "new",
    })) as ExecutiveAlertWithStatus[];
  }, [data?.alerts, statusByAlertId]);

  const filteredAlerts = useMemo(
    () => filterExecutiveAlerts(alertsWithStatus, filters),
    [alertsWithStatus, filters],
  );

  const territoryOptions = useMemo(
    () => listExecutiveAlertTerritories(alertsWithStatus),
    [alertsWithStatus],
  );

  const drawerAlert = useMemo(
    () => resolveExecutiveAlertDrawer(alertsWithStatus, selectedAlertId),
    [alertsWithStatus, selectedAlertId],
  );

  const drawerStatus = drawerAlert
    ? statusByAlertId[drawerAlert.id] ?? "new"
    : "new";

  const updateAlertStatus = useCallback(
    async (alertId: string, status: ExecutiveAlertStatus) => {
      const userId = data?.statusOverlays?.[0]?.userId ?? "local";
      const previousStatus = statusByAlertId[alertId] ?? "new";
      const snoozedUntil = status === "snoozed" ? snoozeUntilIso() : null;
      const overlay = {
        alertId,
        userId,
        status,
        updatedAt: new Date().toISOString(),
        snoozedUntil,
        note: notesByAlertId[alertId],
      };
      writeLocalExecutiveAlertStatus(overlay);
      setStatusByAlertId((current) => ({ ...current, [alertId]: status }));
      try {
        const response = await fetchWithTimeout("/api/executive-alerts/status", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alertId, status, snoozedUntil, previousStatus }),
          timeoutMs: FETCH_T4_INTELLIGENCE_MS,
        });
        const parsed = (await response.json()) as {
          actionLogs?: ExecutiveAlertActionLogEntry[];
        };
        if (parsed.actionLogs) {
          setActionLogs((current) => {
            const others = current.filter((row) => row.alertId !== alertId);
            return [...others, ...parsed.actionLogs!].sort(
              (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
            );
          });
        }
      } catch {
        // Local overlay remains for refresh resilience.
      }
    },
    [data?.statusOverlays, notesByAlertId, statusByAlertId],
  );

  const saveAlertNote = useCallback(async (alertId: string, note: string) => {
    setNotesByAlertId((current) => ({ ...current, [alertId]: note }));
    try {
      const response = await fetchWithTimeout("/api/executive-alerts/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId, note }),
        timeoutMs: FETCH_T4_INTELLIGENCE_MS,
      });
      const parsed = (await response.json()) as {
        logEntry?: ExecutiveAlertActionLogEntry;
      };
      if (parsed.logEntry) {
        setActionLogs((current) => [parsed.logEntry!, ...current]);
      }
    } catch {
      // Note remains in local state until refresh.
    }
  }, []);

  const assignFollowUp = useCallback(
    async (
      alertId: string,
      input: {
        ownerKind: FollowUpOwnerKind;
        ownerName: string;
        dueDate: string;
        priority: FollowUpPriority;
        notes?: string;
      },
    ) => {
      try {
        const response = await fetchWithTimeout("/api/executive-alerts/follow-ups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alertId, ...input }),
          timeoutMs: FETCH_T4_INTELLIGENCE_MS,
        });
        const parsed = (await response.json()) as {
          followUp?: ExecutiveAlertFollowUp;
          logEntry?: ExecutiveAlertActionLogEntry;
        };
        if (parsed.followUp) {
          setFollowUps((current) => [
            ...current.filter((row) => row.alertId !== alertId),
            parsed.followUp!,
          ]);
        }
        if (parsed.logEntry) {
          setActionLogs((current) => [parsed.logEntry!, ...current]);
        }
      } catch {
        // Ignore — user can retry.
      }
    },
    [],
  );

  const handleOpenDrawer = useCallback((alert: ExecutiveAlertWithStatus) => {
    setSelectedAlertId(alert.id);
    if (alert.status === "new") {
      void updateAlertStatus(alert.id, "in-review");
    }
  }, [updateAlertStatus]);

  const handleNavigate = useCallback((alert: ExecutiveAlertWithStatus) => {
    const placementContext =
      alert.destination.tabId === "placement-command-center"
        ? buildPlacementContextFromAlert(alert)
        : undefined;
    navigateRecruitingTab({
      tab: alert.destination.tabId,
      elementId: alert.destination.elementId,
      placementContext,
    });
  }, []);

  const byCategory = useMemo(() => {
    return {
      territory: filteredAlerts.filter((row) => row.category === "territory"),
      project: filteredAlerts.filter((row) => row.category === "project"),
      recruiter: filteredAlerts.filter((row) => row.category === "recruiter"),
      placement: filteredAlerts.filter((row) => row.category === "placement"),
    };
  }, [filteredAlerts]);

  const filteredTopCritical = useMemo(
    () =>
      filterExecutiveAlerts(
        mergeAlertStatuses(data?.topCritical ?? [], []).map((row) => ({
          ...row,
          status: statusByAlertId[row.id] ?? row.status,
        })),
        filters,
      ),
    [data?.topCritical, filters, statusByAlertId],
  );

  const filteredTopActions = useMemo(
    () =>
      filterExecutiveAlerts(
        mergeAlertStatuses(data?.topActions ?? [], [])
          .filter((row) => row.severity !== "critical")
          .map((row) => ({
            ...row,
            status: statusByAlertId[row.id] ?? row.status,
          })),
        filters,
      ).slice(0, 15),
    [data?.topActions, filters, statusByAlertId],
  );

  const followUpQueue = useMemo(
    () =>
      buildExecutiveAlertFollowUpQueue(
        alertsWithStatus,
        followUps,
        statusByAlertId,
      ),
    [alertsWithStatus, followUps, statusByAlertId],
  );

  const drawerActionLogs = useMemo(
    () =>
      actionLogs
        .filter((row) => row.alertId === selectedAlertId)
        .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)),
    [actionLogs, selectedAlertId],
  );

  const drawerFollowUp = useMemo(
    () => followUps.find((row) => row.alertId === selectedAlertId) ?? null,
    [followUps, selectedAlertId],
  );

  const cacheLabel = data?.intelligenceCache
    ? `${data.intelligenceCache.cacheStatus} · ${Math.round(data.intelligenceCache.snapshotAgeMs / 1000)}s`
    : null;

  return (
    <WorkspacePageShell
      loading={loading}
      error={error}
      hasData={Boolean(data?.alerts?.length)}
      loadingMessage="Generating executive alerts…"
      emptyTitle="No alerts generated"
      emptyMessage="Executive alerts will appear when recruiting intelligence identifies actionable risks."
      emptyNextStep="Try refresh after the intelligence cache completes its next sync."
      onRefresh={() => void load(true)}
      partialDataAvailable={Boolean(data?.alerts?.length)}
    >
      {data ? (
        <div id="executive-alert-center" className={UI_SPACE.page}>
          <div className={UI_LAYOUT.pageHeader}>
            <div>
              <h2 className={UI_TYPE.pageTitle}>Executive Alerts</h2>
              <p className={UI_TYPE.pageSubtitle}>
                Prioritized company risks and recommended actions from the unified recruiting intelligence snapshot.
              </p>
            </div>
            <div className={`${UI_LAYOUT.toolbar} items-center`}>
              <div className="flex rounded-lg border border-zinc-700/80 p-0.5">
                <button
                  type="button"
                  className={view === "alerts" ? UI_BUTTON.primary : UI_BUTTON.ghost}
                  onClick={() => setView("alerts")}
                >
                  Alerts
                </button>
                <button
                  type="button"
                  className={view === "follow-up-queue" ? UI_BUTTON.primary : UI_BUTTON.ghost}
                  onClick={() => setView("follow-up-queue")}
                >
                  Follow-Up Queue
                  {followUpQueue.filter((row) => row.isOverdue).length > 0 ? (
                    <span className="ml-1 rounded-full bg-red-500/20 px-1.5 text-[10px] text-red-200">
                      {followUpQueue.filter((row) => row.isOverdue).length}
                    </span>
                  ) : null}
                </button>
              </div>
              {cacheLabel ? (
                <span className="rounded border border-zinc-700/80 px-2 py-1 text-[10px] text-zinc-400">
                  Intel cache · {cacheLabel}
                </span>
              ) : null}
              {data.meta ? (
                <span className="text-xs text-zinc-500">
                  {filteredAlerts.length} shown · {data.meta.bySeverity.critical} critical
                </span>
              ) : null}
              <button
                type="button"
                className={UI_BUTTON.secondary}
                disabled={refreshing}
                onClick={() => void load(true)}
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          <div className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
            <p className={UI_TYPE.kpiLabel}>Filters</p>
            <div className={UI_INPUT.filterBar}>
              <select
                className={UI_INPUT.select}
                value={filters.severity}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    severity: event.target.value as ExecutiveAlertFilterState["severity"],
                  }))
                }
              >
                <option value="all">All severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select
                className={UI_INPUT.select}
                value={filters.category}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    category: event.target.value as ExecutiveAlertFilterState["category"],
                  }))
                }
              >
                <option value="all">All categories</option>
                <option value="project">Project</option>
                <option value="territory">Territory</option>
                <option value="recruiter">Recruiter</option>
                <option value="placement">Placement</option>
                <option value="candidate">Candidate</option>
                <option value="coverage">Coverage</option>
              </select>
              <select
                className={UI_INPUT.select}
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value as ExecutiveAlertFilterState["status"],
                  }))
                }
              >
                <option value="all">All statuses</option>
                <option value="new">New</option>
                <option value="in-review">In Review</option>
                <option value="snoozed">Snoozed</option>
                <option value="resolved">Resolved</option>
              </select>
              <select
                className={UI_INPUT.select}
                value={filters.territory}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    territory: event.target.value,
                  }))
                }
              >
                <option value="all">All DM / territories</option>
                {territoryOptions.map((territory) => (
                  <option key={territory} value={territory}>
                    {territory}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={`${UI_SURFACE.panel} ${UI_SPACE.gridKpi}`}>
            <div>
              <p className={UI_TYPE.kpiLabel}>Critical</p>
              <p className={`${UI_TYPE.kpiValue} text-red-200`}>{data.meta?.bySeverity.critical ?? 0}</p>
            </div>
            <div>
              <p className={UI_TYPE.kpiLabel}>High priority</p>
              <p className={UI_TYPE.kpiValue}>{data.meta?.bySeverity.high ?? 0}</p>
            </div>
            <div>
              <p className={UI_TYPE.kpiLabel}>Follow-ups</p>
              <p className={UI_TYPE.kpiValue}>{followUpQueue.length}</p>
            </div>
            <div>
              <p className={UI_TYPE.kpiLabel}>Overdue</p>
              <p className={`${UI_TYPE.kpiValue} text-red-200`}>
                {followUpQueue.filter((row) => row.isOverdue).length}
              </p>
            </div>
          </div>

          {view === "follow-up-queue" ? (
            <section className={UI_SPACE.section}>
              <div>
                <h2 className={UI_TYPE.sectionTitle}>Follow-Up Queue</h2>
                <p className={UI_TYPE.sectionSubtitle}>
                  Assigned DM and recruiter follow-ups with due dates and current alert status.
                </p>
              </div>
              <ExecutiveAlertFollowUpQueue
                queue={followUpQueue}
                onOpenAlert={(alertId) => {
                  setView("alerts");
                  setSelectedAlertId(alertId);
                }}
              />
            </section>
          ) : (
            <>
          <AlertSection
            title="Critical Alerts"
            subtitle="Top 10 critical items requiring immediate leadership attention."
            alerts={filteredTopCritical}
            emptyMessage="No critical alerts right now."
            onOpenDrawer={handleOpenDrawer}
            onNavigate={handleNavigate}
          />

          <AlertSection
            title="High Priority Actions"
            subtitle="Ranked by impact score across the company."
            alerts={filteredTopActions}
            emptyMessage="No high-priority actions queued."
            onOpenDrawer={handleOpenDrawer}
            onNavigate={handleNavigate}
          />

          <AlertSection
            title="Territory Risks"
            subtitle="DM territories with coverage or escalation risk."
            alerts={byCategory.territory.slice(0, 8)}
            emptyMessage="Territories look stable."
            onOpenDrawer={handleOpenDrawer}
            onNavigate={handleNavigate}
          />

          <AlertSection
            title="Project Risks"
            subtitle="Stores and projects with coverage or forecast failures."
            alerts={byCategory.project.slice(0, 8)}
            emptyMessage="No elevated project risks."
            onOpenDrawer={handleOpenDrawer}
            onNavigate={handleNavigate}
          />

          <AlertSection
            title="Recruiter Risks"
            subtitle="Workload imbalance, follow-ups, and paperwork backlog."
            alerts={byCategory.recruiter.slice(0, 8)}
            emptyMessage="Recruiter workloads look balanced."
            onOpenDrawer={handleOpenDrawer}
            onNavigate={handleNavigate}
          />

          <AlertSection
            title="Placement Risks"
            subtitle="Zero-pipeline stores, open-call recovery, and funnel degradation."
            alerts={byCategory.placement.slice(0, 8)}
            emptyMessage="Placement funnel looks healthy."
            onOpenDrawer={handleOpenDrawer}
            onNavigate={handleNavigate}
          />
            </>
          )}

          <ExecutiveAlertDetailDrawer
            open={Boolean(selectedAlertId)}
            alert={drawerAlert}
            status={drawerStatus}
            note={selectedAlertId ? notesByAlertId[selectedAlertId] ?? "" : ""}
            actionLogs={drawerActionLogs}
            followUp={drawerFollowUp}
            assigneeOptions={assigneeOptions}
            onClose={() => setSelectedAlertId(null)}
            onStatusChange={(status) => {
              if (!drawerAlert) return;
              void updateAlertStatus(drawerAlert.id, status);
            }}
            onSaveNote={(note) => {
              if (!drawerAlert) return;
              void saveAlertNote(drawerAlert.id, note);
            }}
            onAssignFollowUp={(input) => {
              if (!drawerAlert) return;
              void assignFollowUp(drawerAlert.id, input);
            }}
            onNavigate={(alert) => {
              setSelectedAlertId(null);
              handleNavigate({ ...alert, status: drawerStatus });
            }}
          />
        </div>
      ) : null}
    </WorkspacePageShell>
  );
}
