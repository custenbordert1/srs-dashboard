"use client";

import { WorkspaceEmptyState } from "@/components/ui/workspace-empty-state";
import { WorkspacePageShell } from "@/components/ui/workspace-page-shell";
import {
  fetchExecutiveIntelligenceRoute,
  scheduleExecutiveBackgroundRefresh,
} from "@/lib/executive-routes/executive-intelligence-client";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
import {
  AUTOPILOT_RECOMMENDATION_LABELS,
  type AutopilotRecommendation,
  type RecruitingAutopilotSnapshot,
} from "@/lib/recruiting-autopilot";
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

type AutopilotResponse = {
  ok?: boolean;
  error?: string;
  snapshot?: RecruitingAutopilotSnapshot;
  meta?: {
    partialSync?: boolean;
    refreshedAt?: string;
    intelligenceCache?: RecruitingIntelligenceCacheMeta;
  };
};

type AutopilotView = "highest-impact" | "quick-wins" | "long-term" | "by-dm" | "by-project";

function navigateRecommendation(rec: AutopilotRecommendation) {
  navigateRecruitingTab({
    tab: rec.navigation.tabId,
    elementId: rec.navigation.elementId,
  });
}

function RecommendationCard({ recommendation }: { recommendation: AutopilotRecommendation }) {
  return (
    <article className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${UI_BADGE.critical}`}>
              Impact {recommendation.impactScore}
            </span>
            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${UI_BADGE.moderate}`}>
              ROI {recommendation.opportunity.expectedRoiScore}
            </span>
            <span className="rounded bg-zinc-900 px-2 py-0.5 text-[10px] uppercase text-zinc-400">
              {recommendation.entityType}
            </span>
            <span className="rounded bg-zinc-900 px-2 py-0.5 text-[10px] uppercase text-zinc-400">
              {recommendation.horizon === "quick-win" ? "Quick win" : "Long-term"}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-zinc-50">
            {AUTOPILOT_RECOMMENDATION_LABELS[recommendation.kind]}
          </h3>
          <p className="text-sm text-zinc-300">{recommendation.entityLabel}</p>
          <p className="text-xs text-zinc-500">{recommendation.reasoning}</p>
        </div>
        <button type="button" className={UI_BUTTON.primary} onClick={() => navigateRecommendation(recommendation)}>
          {recommendation.navigation.label}
        </button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {recommendation.supportingMetrics.map((metric) => (
          <div key={`${recommendation.id}:${metric.label}`} className="rounded-lg bg-zinc-900/50 px-3 py-2">
            <p className="text-[10px] uppercase text-zinc-500">{metric.label}</p>
            <p className="text-sm font-medium text-zinc-100">{metric.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-400">
        <span>Confidence {recommendation.confidenceScore}%</span>
        <span>Outcome +{recommendation.estimatedOutcomeImprovement}%</span>
        <span>Candidates +{recommendation.opportunity.estimatedCandidateGain}</span>
        <span>Coverage +{recommendation.opportunity.estimatedCoverageGain}%</span>
        <span>Completion +{recommendation.opportunity.estimatedCompletionGain}%</span>
      </div>
    </article>
  );
}

function RecommendationList({
  recommendations,
  emptyMessage,
}: {
  recommendations: AutopilotRecommendation[];
  emptyMessage: string;
}) {
  if (recommendations.length === 0) {
    return <WorkspaceEmptyState title={emptyMessage} message="No recommendations in this view." />;
  }
  return (
    <div className="grid gap-3">
      {recommendations.map((row) => (
        <RecommendationCard key={row.id} recommendation={row} />
      ))}
    </div>
  );
}

export function RecruitingAutopilotCenter() {
  const [data, setData] = useState<AutopilotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<AutopilotView>("highest-impact");

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const { snapshot, meta } = await fetchExecutiveIntelligenceRoute<RecruitingAutopilotSnapshot>(
        "/api/recruiting-autopilot",
        { force },
      );
      setData({ ok: true, snapshot, meta });
      if (!force) scheduleExecutiveBackgroundRefresh((nextForce) => void load(nextForce), meta);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Load failed");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const snapshot = data?.snapshot;
  const cacheLabel = data?.meta?.intelligenceCache
    ? `${data.meta.intelligenceCache.cacheStatus} · ${Math.round(data.meta.intelligenceCache.snapshotAgeMs / 1000)}s`
    : null;

  const viewRecommendations =
    snapshot == null
      ? []
      : view === "highest-impact"
        ? snapshot.highestImpact
        : view === "quick-wins"
          ? snapshot.quickWins
          : view === "long-term"
            ? snapshot.longTerm
            : view === "by-dm"
              ? Object.values(snapshot.byDm).flat().slice(0, 25)
              : Object.values(snapshot.byProject).flat().slice(0, 25);

  return (
    <WorkspacePageShell
      loading={loading}
      error={error}
      hasData={Boolean(snapshot?.all.length)}
      loadingMessage="Generating autopilot recommendations…"
      emptyTitle="No recommendations"
      emptyMessage="Autopilot recommendations appear when intelligence surfaces actionable recruiting opportunities."
      onRefresh={() => void load(true)}
      partialDataAvailable={Boolean(snapshot?.all.length)}
    >
      {snapshot ? (
        <div id="recruiting-autopilot-center" className={UI_SPACE.page}>
          <div className={UI_LAYOUT.pageHeader}>
            <div>
              <h2 className={UI_TYPE.pageTitle}>Autopilot Recommendations</h2>
              <p className={UI_TYPE.pageSubtitle}>
                Prioritized operational actions to improve recruiting outcomes — powered by intelligence cache, alerts, follow-ups, and predictive risk.
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
              <p className={UI_TYPE.kpiLabel}>Top actions today</p>
              <p className={UI_TYPE.kpiValue}>{snapshot.executiveSummary.topActionsToday.length}</p>
            </div>
            <div>
              <p className={UI_TYPE.kpiLabel}>Expected candidates</p>
              <p className={UI_TYPE.kpiValue}>{snapshot.executiveSummary.expectedAdditionalCandidates}</p>
            </div>
            <div>
              <p className={UI_TYPE.kpiLabel}>Expected hires</p>
              <p className={UI_TYPE.kpiValue}>{snapshot.executiveSummary.expectedAdditionalHires}</p>
            </div>
            <div>
              <p className={UI_TYPE.kpiLabel}>Coverage gain</p>
              <p className={UI_TYPE.kpiValue}>{snapshot.executiveSummary.expectedAdditionalStoreCoverage}%</p>
            </div>
            <div>
              <p className={UI_TYPE.kpiLabel}>Risk reduction</p>
              <p className={UI_TYPE.kpiValue}>{snapshot.executiveSummary.expectedRiskReduction}</p>
            </div>
          </div>

          <section className={UI_SPACE.section}>
            <div>
              <h2 className={UI_TYPE.sectionTitle}>Top 10 Actions To Take Today</h2>
              <p className={UI_TYPE.sectionSubtitle}>
                Highest-priority recommendations ranked by risk, coverage impact, hiring velocity, deadlines, and historical effectiveness.
              </p>
            </div>
            <RecommendationList
              recommendations={snapshot.executiveSummary.topActionsToday}
              emptyMessage="No actions recommended today."
            />
          </section>

          <div className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
            <p className={UI_TYPE.kpiLabel}>Views</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["highest-impact", "Highest impact"],
                  ["quick-wins", "Quick wins"],
                  ["long-term", "Long-term"],
                  ["by-dm", "By DM"],
                  ["by-project", "By project"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={view === id ? UI_BUTTON.primary : UI_BUTTON.secondary}
                  onClick={() => setView(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <section className={UI_SPACE.section}>
            <RecommendationList recommendations={viewRecommendations} emptyMessage="No recommendations in this view." />
          </section>
        </div>
      ) : null}
    </WorkspacePageShell>
  );
}
