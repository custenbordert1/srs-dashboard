"use client";

import { ExecutiveDataWarningBanner } from "@/components/executive/executive-data-warning-banner";
import { WorkspaceEmptyState } from "@/components/ui/workspace-empty-state";
import { WorkspacePageShell } from "@/components/ui/workspace-page-shell";
import { EXECUTIVE_ALERT_STATUS_LABELS, type ExecutiveAlertStatus } from "@/lib/alerts/executive-alert-status-types";
import {
  buildDailyActionExecutionContext,
  buildFollowUpPayloadFromDailyAction,
  type DailyActionPlanItem,
  type DailyActionPlanSnapshot,
  writeDailyActionExecutionContext,
} from "@/lib/executive-daily-action-plan";
import {
  fetchExecutiveIntelligenceRoute,
  scheduleExecutiveBackgroundRefresh,
} from "@/lib/executive-routes/executive-intelligence-client";
import type { ExecutiveIntelligenceRouteMeta } from "@/lib/executive-routes/executive-intelligence-route";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
import { navigateRecruitingTab } from "@/lib/recruiting-tab-navigation";
import type { RecruitingIntelligenceCacheMeta } from "@/lib/recruiting-intelligence/recruiting-intelligence-types";
import {
  UI_BADGE,
  UI_BUTTON,
  UI_LAYOUT,
  UI_SPACE,
  UI_SURFACE,
  UI_TYPE,
} from "@/lib/ui-tokens";
import { useCallback, useEffect, useState } from "react";

type DailyActionPlanResponse = {
  ok?: boolean;
  error?: string;
  snapshot?: DailyActionPlanSnapshot;
  meta?: {
    partialSync?: boolean;
    refreshedAt?: string;
    intelligenceCache?: RecruitingIntelligenceCacheMeta;
  };
};

const BUCKET_LABELS = {
  "must-do-today": "Must do today",
  "should-do-this-week": "Should do this week",
  "monitor-only": "Monitor only",
} as const;

const STATUS_BADGE: Record<ExecutiveAlertStatus, string> = {
  new: "border-sky-500/30 bg-sky-500/10 text-sky-100",
  "in-review": "border-amber-500/30 bg-amber-500/10 text-amber-100",
  snoozed: "border-zinc-600/50 bg-zinc-800/60 text-zinc-300",
  resolved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
};

function snoozeUntilIso(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

function ActionPlanCard({
  item,
  onStatusChange,
  onCreateFollowUp,
  onExecute,
}: {
  item: DailyActionPlanItem;
  onStatusChange: (alertId: string, status: ExecutiveAlertStatus) => void;
  onCreateFollowUp: (item: DailyActionPlanItem) => void;
  onExecute: (item: DailyActionPlanItem) => void;
}) {
  return (
    <article className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${UI_BADGE.critical}`}>
              {BUCKET_LABELS[item.bucket]}
            </span>
            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_BADGE[item.status]}`}>
              {EXECUTIVE_ALERT_STATUS_LABELS[item.status]}
            </span>
            <span className="text-[10px] text-zinc-500">Impact {item.expectedImpact}</span>
          </div>
          <h3 className="text-sm font-semibold text-zinc-50">{item.title}</h3>
          <p className="text-sm text-zinc-300">{item.links.recommendationTitle}</p>
          <p className="text-xs text-zinc-500">{item.reasoning}</p>
          <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
            <span>Owner · {item.owner}</span>
            <span>Due · {new Date(item.dueDate).toLocaleDateString()}</span>
            <span>Coverage +{item.expectedCoverageGain}%</span>
            <span>Hires +{item.expectedHireGain}</span>
            <span>Risk {item.links.riskScore}</span>
            {item.links.relatedAlertTitle ? (
              <span>Alert · {item.links.relatedAlertTitle}</span>
            ) : null}
          </div>
        </div>
        <button type="button" className={UI_BUTTON.primary} onClick={() => onExecute(item)}>
          {item.navigation.label}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={UI_BUTTON.secondary} onClick={() => onCreateFollowUp(item)}>
          Create follow-up
        </button>
        <button type="button" className={UI_BUTTON.secondary} onClick={() => onStatusChange(item.alertId, "in-review")}>
          Mark in review
        </button>
        <button type="button" className={UI_BUTTON.secondary} onClick={() => onStatusChange(item.alertId, "snoozed")}>
          Snooze
        </button>
        <button type="button" className={UI_BUTTON.secondary} onClick={() => onStatusChange(item.alertId, "resolved")}>
          Resolve
        </button>
      </div>
    </article>
  );
}

function ActionSection({
  title,
  subtitle,
  items,
  emptyMessage,
  onStatusChange,
  onCreateFollowUp,
  onExecute,
}: {
  title: string;
  subtitle: string;
  items: DailyActionPlanItem[];
  emptyMessage: string;
  onStatusChange: (alertId: string, status: ExecutiveAlertStatus) => void;
  onCreateFollowUp: (item: DailyActionPlanItem) => void;
  onExecute: (item: DailyActionPlanItem) => void;
}) {
  return (
    <section className={UI_SPACE.section}>
      <div>
        <h2 className={UI_TYPE.sectionTitle}>{title}</h2>
        <p className={UI_TYPE.sectionSubtitle}>{subtitle}</p>
      </div>
      {items.length === 0 ? (
        <WorkspaceEmptyState title={emptyMessage} message="No actions in this bucket." />
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <ActionPlanCard
              key={item.id}
              item={item}
              onStatusChange={onStatusChange}
              onCreateFollowUp={onCreateFollowUp}
              onExecute={onExecute}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function ExecutiveDailyActionPlan() {
  const [data, setData] = useState<DailyActionPlanResponse | null>(null);
  const [routeMeta, setRouteMeta] = useState<ExecutiveIntelligenceRouteMeta | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusByAlertId, setStatusByAlertId] = useState<Record<string, ExecutiveAlertStatus>>({});

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const { snapshot, meta } = await fetchExecutiveIntelligenceRoute<DailyActionPlanSnapshot>(
        "/api/executive-daily-action-plan",
        { force },
      );
      setData({ ok: true, snapshot, meta });
      setRouteMeta(meta);
      setStatusByAlertId(
        Object.fromEntries(snapshot.all.map((row) => [row.alertId, row.status])),
      );
      setLoaded(true);
      if (!force) scheduleExecutiveBackgroundRefresh((nextForce) => void load(nextForce), meta);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Load failed");
      setLoaded(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const withStatus = useCallback(
    (items: DailyActionPlanItem[]) =>
      items.map((item) => ({ ...item, status: statusByAlertId[item.alertId] ?? item.status })),
    [statusByAlertId],
  );

  const updateStatus = useCallback(async (alertId: string, status: ExecutiveAlertStatus) => {
    const snoozedUntil = status === "snoozed" ? snoozeUntilIso() : null;
    setStatusByAlertId((current) => ({ ...current, [alertId]: status }));
    try {
      await fetchWithTimeout("/api/executive-alerts/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId, status, snoozedUntil }),
        timeoutMs: FETCH_T4_INTELLIGENCE_MS,
      });
    } catch {
      // Optimistic local state remains.
    }
  }, []);

  const createFollowUp = useCallback(async (item: DailyActionPlanItem) => {
    const payload = buildFollowUpPayloadFromDailyAction(item);
    try {
      await fetchWithTimeout("/api/executive-alerts/follow-ups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        timeoutMs: FETCH_T4_INTELLIGENCE_MS,
      });
      void updateStatus(item.alertId, "in-review");
    } catch {
      // User can retry from the card.
    }
  }, [updateStatus]);

  const executeAction = useCallback((item: DailyActionPlanItem) => {
    writeDailyActionExecutionContext(buildDailyActionExecutionContext(item));
    navigateRecruitingTab({
      tab: item.navigation.tabId,
      elementId: item.navigation.elementId,
    });
  }, []);

  const snapshot = data?.snapshot;
  const cacheLabel = data?.meta?.intelligenceCache
    ? `${data.meta.intelligenceCache.cacheStatus} · ${Math.round(data.meta.intelligenceCache.snapshotAgeMs / 1000)}s`
    : null;

  return (
    <WorkspacePageShell
      loading={loading && !loaded}
      error={error}
      hasData={loaded}
      loadingMessage="Building daily action plan…"
      emptyTitle="No actions planned"
      emptyMessage="Daily actions appear when autopilot recommendations are available."
      onRefresh={() => void load(true)}
      partialDataAvailable={loaded}
    >
      {snapshot ? (
        <div id="executive-daily-action-plan" className={UI_SPACE.page}>
          <ExecutiveDataWarningBanner meta={routeMeta} onRefresh={() => void load(true)} />
          <div className={UI_LAYOUT.pageHeader}>
            <div>
              <h2 className={UI_TYPE.pageTitle}>Daily Action Plan</h2>
              <p className={UI_TYPE.pageSubtitle}>
                Morning operating view for {snapshot.planDate} — autopilot recommendations grouped into today&apos;s execution plan.
              </p>
            </div>
            <div className={`${UI_LAYOUT.toolbar} items-center`}>
              {cacheLabel ? (
                <span className="rounded border border-zinc-700/80 px-2 py-1 text-[10px] text-zinc-400">
                  Intel cache · {cacheLabel}
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

          <div className={`${UI_SURFACE.panel} ${UI_SPACE.gridKpi}`}>
            <div>
              <p className={UI_TYPE.kpiLabel}>Critical actions today</p>
              <p className={`${UI_TYPE.kpiValue} text-red-200`}>
                {snapshot.executiveSummary.criticalActionsToday}
              </p>
            </div>
            <div>
              <p className={UI_TYPE.kpiLabel}>Projected coverage gain</p>
              <p className={UI_TYPE.kpiValue}>{snapshot.executiveSummary.projectedCoverageGain}%</p>
            </div>
            <div>
              <p className={UI_TYPE.kpiLabel}>Projected hire gain</p>
              <p className={UI_TYPE.kpiValue}>{snapshot.executiveSummary.projectedHireGain}</p>
            </div>
            <div>
              <p className={UI_TYPE.kpiLabel}>Risk reduction</p>
              <p className={UI_TYPE.kpiValue}>{snapshot.executiveSummary.riskReduction}</p>
            </div>
          </div>

          <ActionSection
            title="Today's Top Actions"
            subtitle="Top 10 autopilot recommendations for executive focus this morning."
            items={withStatus(snapshot.topActionsToday)}
            emptyMessage="No top actions for today."
            onStatusChange={updateStatus}
            onCreateFollowUp={createFollowUp}
            onExecute={executeAction}
          />

          <ActionSection
            title="Must Do Today"
            subtitle="Highest urgency actions with immediate deadline pressure."
            items={withStatus(snapshot.mustDoToday)}
            emptyMessage="No must-do actions today."
            onStatusChange={updateStatus}
            onCreateFollowUp={createFollowUp}
            onExecute={executeAction}
          />

          <ActionSection
            title="Should Do This Week"
            subtitle="Important improvements to schedule before the week closes."
            items={withStatus(snapshot.shouldDoThisWeek)}
            emptyMessage="No weekly actions queued."
            onStatusChange={updateStatus}
            onCreateFollowUp={createFollowUp}
            onExecute={executeAction}
          />

          <ActionSection
            title="Monitor Only"
            subtitle="Lower urgency signals to watch without immediate intervention."
            items={withStatus(snapshot.monitorOnly)}
            emptyMessage="Nothing to monitor."
            onStatusChange={updateStatus}
            onCreateFollowUp={createFollowUp}
            onExecute={executeAction}
          />
        </div>
      ) : null}
    </WorkspacePageShell>
  );
}
