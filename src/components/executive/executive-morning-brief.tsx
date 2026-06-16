"use client";

import { ExecutiveDataWarningBanner } from "@/components/executive/executive-data-warning-banner";
import { WorkspacePageShell } from "@/components/ui/workspace-page-shell";
import type { CeoHomeSnapshot, TrafficLight } from "@/lib/executive-morning-brief/types";
import type { ExecutiveMorningBriefSnapshot } from "@/lib/executive-morning-brief/types";
import {
  fetchExecutiveIntelligenceRoute,
  scheduleExecutiveBackgroundRefresh,
} from "@/lib/executive-routes/executive-intelligence-client";
import type { ExecutiveIntelligenceRouteMeta } from "@/lib/executive-routes/executive-intelligence-route";
import { navigateRecruitingTab } from "@/lib/recruiting-tab-navigation";
import type { DashboardTabId } from "@/lib/recruiting-tab-source-labels";
import {
  UI_BUTTON,
  UI_LAYOUT,
  UI_SPACE,
  UI_SURFACE,
  UI_TYPE,
} from "@/lib/ui-tokens";
import { useCallback, useEffect, useState } from "react";

const TRAFFIC_LIGHT: Record<TrafficLight, { dot: string; ring: string; label: string }> = {
  green: { dot: "bg-emerald-400", ring: "ring-emerald-500/30", label: "Healthy" },
  yellow: { dot: "bg-amber-400", ring: "ring-amber-500/30", label: "Watch" },
  red: { dot: "bg-red-400", ring: "ring-red-500/30", label: "Act now" },
};

const QUICK_NAV: Array<{ tabId: DashboardTabId; label: string }> = [
  { tabId: "predictive-territory-risk", label: "Territory Risks" },
  { tabId: "daily-action-plan", label: "Daily Action Plan" },
  { tabId: "executive-alerts", label: "Executive Alerts" },
  { tabId: "automation-control-center", label: "Automation Control Center" },
  { tabId: "recommendation-intelligence", label: "Recommendation Intelligence" },
];

function TrafficLightBadge({ light }: { light: TrafficLight }) {
  const style = TRAFFIC_LIGHT[light];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ${style.ring} text-zinc-200`}>
      <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden />
      {style.label}
    </span>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  light,
}: {
  title: string;
  value: string;
  subtitle?: string;
  light: TrafficLight;
}) {
  return (
    <article className={`${UI_SURFACE.panel} flex flex-col gap-2 p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</p>
        <TrafficLightBadge light={light} />
      </div>
      <p className="text-2xl font-semibold tabular-nums text-zinc-50 sm:text-3xl">{value}</p>
      {subtitle ? <p className="text-xs text-zinc-500">{subtitle}</p> : null}
    </article>
  );
}

function CeoHomeDashboard({
  ceo,
  planDate,
  onNavigate,
}: {
  ceo: CeoHomeSnapshot;
  planDate: string;
  onNavigate: (tabId: DashboardTabId, elementId?: string) => void;
}) {
  return (
    <div className={`${UI_SPACE.page} space-y-6`}>
      <div className={`${UI_SURFACE.panel} border-l-4 border-l-sky-500/60 p-4 sm:p-5`}>
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h3 className={UI_TYPE.sectionTitle}>Executive Summary</h3>
          <TrafficLightBadge light={ceo.onTrack} />
          <span className="text-xs text-zinc-500">{planDate}</span>
        </div>
        <p className="text-sm leading-relaxed text-zinc-200 sm:text-base">{ceo.narrative}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_NAV.map((item) => (
          <button
            key={item.tabId}
            type="button"
            className={UI_BUTTON.secondary}
            onClick={() => onNavigate(item.tabId)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Recruiting Health"
          value={`${ceo.recruitingHealth.score}`}
          subtitle={ceo.recruitingHealth.label}
          light={ceo.recruitingHealth.light}
        />
        <KpiCard
          title="Coverage"
          value={`${ceo.coverage.score}%`}
          subtitle={ceo.coverage.trendLabel}
          light={ceo.coverage.light}
        />
        <KpiCard
          title="Hiring Forecast (14d)"
          value={ceo.hiringForecast.horizon14Coverage != null ? `${ceo.hiringForecast.horizon14Coverage}%` : "—"}
          subtitle={ceo.hiringForecast.summary}
          light={ceo.hiringForecast.light}
        />
        <KpiCard
          title="Automation Queue"
          value={String(ceo.automationQueue.pendingApprovals)}
          subtitle={ceo.automationQueue.summary}
          light={ceo.automationQueue.light}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm} lg:col-span-1`}>
          <h3 className={UI_TYPE.sectionTitle}>Critical Territories</h3>
          {ceo.criticalTerritories.length === 0 ? (
            <p className="text-sm text-zinc-500">No critical territories flagged.</p>
          ) : (
            <ul className="space-y-2">
              {ceo.criticalTerritories.map((row) => (
                <li key={row.territoryLabel} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2">
                  <p className="text-sm font-medium text-zinc-100">{row.territoryLabel}</p>
                  <p className="text-xs text-zinc-500">
                    {row.riskLevel} · {row.coveragePercent}% coverage
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm} lg:col-span-1`}>
          <h3 className={UI_TYPE.sectionTitle}>Top Risks</h3>
          <ul className="space-y-2">
            {ceo.topRisks.map((row) => (
              <li key={row.title} className="flex items-start justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-zinc-100">{row.title}</p>
                  <p className="text-xs text-zinc-500">{row.detail}</p>
                </div>
                <TrafficLightBadge light={row.light} />
              </li>
            ))}
          </ul>
        </section>

        <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm} lg:col-span-1`}>
          <h3 className={UI_TYPE.sectionTitle}>Top Opportunities</h3>
          <ul className="space-y-2">
            {ceo.topOpportunities.map((row) => (
              <li key={row.recommendationType} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2">
                <p className="text-sm font-medium text-emerald-100/90">{row.label}</p>
                <p className="text-xs text-zinc-500">{row.successRate}% success · {row.trackedCount} tracked</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
        <h3 className={UI_TYPE.sectionTitle}>Top 5 Priorities Today</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {ceo.topPriorities.map((row) => (
            <article key={row.sourceId} className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2">
              <div>
                <p className="text-sm font-medium text-zinc-100">
                  {row.rank}. {row.title}
                </p>
                <p className="text-xs text-zinc-500">{row.owner ?? "Unassigned"} · Impact {row.impactScore}</p>
              </div>
              <button
                type="button"
                className={UI_BUTTON.secondary}
                onClick={() => onNavigate(row.navigationTabId, row.navigationElementId)}
              >
                Open
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
        <h3 className={UI_TYPE.sectionTitle}>Recommended Actions</h3>
        <div className="space-y-3">
          {ceo.recommendedActions.map((action) => (
            <article
              key={action.id}
              className="flex flex-col gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-50">{action.title}</p>
                <p className="mt-1 text-xs text-zinc-400">{action.expectedImpact}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {action.owner ?? "Unassigned"}
                  {action.dueDate ? ` · Due ${action.dueDate.slice(0, 10)}` : ""}
                </p>
              </div>
              <button
                type="button"
                className={`${UI_BUTTON.primary} shrink-0`}
                onClick={() => onNavigate(action.navigationTabId, action.navigationElementId)}
              >
                Take action
              </button>
            </article>
          ))}
          {ceo.recommendedActions.length === 0 ? (
            <p className="text-sm text-zinc-500">No recommended actions in the current snapshot.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function ExecutiveMorningBrief() {
  const [snapshot, setSnapshot] = useState<ExecutiveMorningBriefSnapshot | null>(null);
  const [routeMeta, setRouteMeta] = useState<ExecutiveIntelligenceRouteMeta | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const { snapshot: data, meta } = await fetchExecutiveIntelligenceRoute<ExecutiveMorningBriefSnapshot>(
        "/api/executive-morning-brief",
        { force },
      );
      setSnapshot(data);
      setRouteMeta(meta);
      setLoaded(true);
      if (!force) scheduleExecutiveBackgroundRefresh((nextForce) => void load(nextForce), meta);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load executive home");
      setLoaded(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const handleNavigate = useCallback((tabId: DashboardTabId, elementId?: string) => {
    navigateRecruitingTab({ tab: tabId, elementId });
  }, []);

  return (
    <WorkspacePageShell
      loading={loading && !loaded}
      error={error}
      hasData={loaded}
      loadingMessage="Loading executive home…"
      emptyTitle="Executive home unavailable"
      emptyMessage="Intelligence cache has not produced a CEO briefing yet."
      onRefresh={() => void load(true)}
      partialDataAvailable={loaded}
    >
      {snapshot ? (
        <div id="executive-home-ceo-mode" className={UI_SPACE.page}>
          <ExecutiveDataWarningBanner meta={routeMeta} onRefresh={() => void load(true)} />

          <div className={UI_LAYOUT.pageHeader}>
            <div>
              <h2 className={UI_TYPE.pageTitle}>Executive Home</h2>
              <p className={UI_TYPE.pageSubtitle}>
                CEO Mode — on track, at risk, priorities, opportunities, and next actions in under 30 seconds.
              </p>
            </div>
            <button type="button" className={UI_BUTTON.primary} disabled={refreshing} onClick={() => void load(true)}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <CeoHomeDashboard
            ceo={snapshot.ceoHome}
            planDate={snapshot.planDate}
            onNavigate={handleNavigate}
          />
        </div>
      ) : null}
    </WorkspacePageShell>
  );
}
