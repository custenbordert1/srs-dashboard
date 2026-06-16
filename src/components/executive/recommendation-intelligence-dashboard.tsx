"use client";

import { ExecutiveDataWarningBanner } from "@/components/executive/executive-data-warning-banner";
import { WorkspaceEmptyState } from "@/components/ui/workspace-empty-state";
import { WorkspacePageShell } from "@/components/ui/workspace-page-shell";
import {
  fetchExecutiveIntelligenceRoute,
  scheduleExecutiveBackgroundRefresh,
} from "@/lib/executive-routes/executive-intelligence-client";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
import type {
  EffectivenessRating,
  RecommendationIntelligenceSnapshot,
  RecommendationRecord,
  RecommendationRoiLeaderboardEntry,
  RecommendationTypePerformance,
} from "@/lib/recommendation-intelligence/types";
import {
  UI_BADGE,
  UI_BUTTON,
  UI_LAYOUT,
  UI_SPACE,
  UI_SURFACE,
  UI_TYPE,
} from "@/lib/ui-tokens";
import { useCallback, useEffect, useState } from "react";

const EFFECTIVENESS_BADGE: Record<EffectivenessRating, string> = {
  "Highly Effective": "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  Effective: "border-teal-500/30 bg-teal-500/10 text-teal-100",
  Neutral: "border-zinc-600/50 bg-zinc-800/60 text-zinc-300",
  Ineffective: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  "Negative Impact": "border-rose-500/30 bg-rose-500/10 text-rose-100",
};

function TypePerformanceTable({
  title,
  rows,
}: {
  title: string;
  rows: RecommendationTypePerformance[];
}) {
  if (rows.length === 0) {
    return (
      <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
        <h3 className={UI_TYPE.sectionTitle}>{title}</h3>
        <p className="text-sm text-zinc-500">No scored recommendation types yet.</p>
      </section>
    );
  }
  return (
    <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
      <h3 className={UI_TYPE.sectionTitle}>{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
              <th className="pb-2 pr-3">Type</th>
              <th className="pb-2 pr-3">Success</th>
              <th className="pb-2 pr-3">Tracked</th>
              <th className="pb-2">Avg gain</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.recommendationType} className="border-b border-zinc-800/60">
                <td className="py-2 pr-3 font-medium text-zinc-200">{row.label}</td>
                <td className="py-2 pr-3 tabular-nums text-zinc-300">{row.successRate}%</td>
                <td className="py-2 pr-3 text-zinc-400">{row.totalTracked}</td>
                <td className="py-2 text-zinc-400">+{row.averageApplicantGain}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RoiLeaderboard({ rows }: { rows: RecommendationRoiLeaderboardEntry[] }) {
  if (rows.length === 0) {
    return <WorkspaceEmptyState title="No ROI data" message="Execute recommendations to build the leaderboard." />;
  }
  return (
    <div className="grid gap-3">
      {rows.map((row) => (
        <article key={row.recommendationId} className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-zinc-50">{row.label}</p>
              <p className="text-xs text-zinc-500">
                {row.owner ?? "Unassigned"} · {row.territory ?? "Nationwide"}
              </p>
            </div>
            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${UI_BADGE.moderate}`}>
              ROI {row.roiScore}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-400">
            <span>Expected +{row.expectedApplicantGain} applicants</span>
            <span>Actual +{row.actualApplicantGain}</span>
            <span>Status {row.status}</span>
            {row.effectiveness ? (
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${EFFECTIVENESS_BADGE[row.effectiveness]}`}
              >
                {row.effectiveness}
              </span>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function RecentRecordCard({
  record,
  onExecute,
}: {
  record: RecommendationRecord;
  onExecute: (id: string) => void;
}) {
  return (
    <article className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-zinc-50">{record.expectedOutcome}</p>
          <p className="text-xs text-zinc-500">{record.recommendationType.replace(/-/g, " ")}</p>
          <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
            <span>Status · {record.status}</span>
            <span>Impact · {record.expectedImpactScore}</span>
            {record.owner ? <span>Owner · {record.owner}</span> : null}
            {record.effectiveness ? <span>Effectiveness · {record.effectiveness}</span> : null}
          </div>
        </div>
        {record.status === "Ignored" ? (
          <button type="button" className={UI_BUTTON.secondary} onClick={() => onExecute(record.recommendationId)}>
            Start tracking
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function RecommendationIntelligenceDashboard() {
  const [snapshot, setSnapshot] = useState<RecommendationIntelligenceSnapshot | null>(null);
  const [meta, setMeta] = useState<Awaited<ReturnType<typeof fetchExecutiveIntelligenceRoute>>["meta"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await fetchExecutiveIntelligenceRoute<RecommendationIntelligenceSnapshot>(
        "/api/recommendation-intelligence",
        { force },
      );
      setSnapshot(result.snapshot);
      setMeta(result.meta);
      if (!force) scheduleExecutiveBackgroundRefresh((nextForce) => void load(nextForce), result.meta);
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

  const executeRecommendation = useCallback(
    async (recommendationId: string) => {
      try {
        const response = await fetchWithTimeout("/api/recommendation-intelligence/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recommendationId, markExecuted: true }),
          timeoutMs: FETCH_T4_INTELLIGENCE_MS,
        });
        const payload = (await response.json()) as { ok?: boolean; error?: string };
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error ?? "Execute failed");
        }
        await load(true);
      } catch (executeError) {
        setError(executeError instanceof Error ? executeError.message : "Execute failed");
      }
    },
    [load],
  );

  const summary = snapshot?.executiveSummary;
  const cacheLabel = meta?.intelligenceCache
    ? `${meta.intelligenceCache.cacheStatus} · ${Math.round(meta.intelligenceCache.snapshotAgeMs / 1000)}s`
    : null;

  return (
    <WorkspacePageShell
      loading={loading}
      error={error}
      hasData={Boolean(snapshot)}
      loadingMessage="Loading recommendation intelligence…"
      emptyTitle="No recommendation data"
      emptyMessage="Recommendation validation appears when autopilot and daily actions generate trackable recommendations."
      onRefresh={() => void load(true)}
      partialDataAvailable={Boolean(snapshot)}
    >
      {snapshot && summary ? (
        <div id="recommendation-intelligence-dashboard" className={UI_SPACE.page}>
          {meta?.warnings?.length ? <ExecutiveDataWarningBanner warnings={meta.warnings} /> : null}

          <div className={UI_LAYOUT.pageHeader}>
            <div>
              <h2 className={UI_TYPE.pageTitle}>Recommendation Intelligence</h2>
              <p className={UI_TYPE.pageSubtitle}>
                Measure whether recommendations improve hiring, coverage, applicant flow, and project completion.
              </p>
            </div>
            <div className={`${UI_LAYOUT.toolbar} items-center`}>
              {cacheLabel ? (
                <span className="rounded border border-zinc-700/80 px-2 py-1 text-[10px] text-zinc-400">
                  Intel cache · {cacheLabel}
                </span>
              ) : null}
              <button type="button" className={UI_BUTTON.secondary} disabled={refreshing} onClick={() => void load(true)}>
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          <div className={`${UI_SURFACE.panel} ${UI_SPACE.gridKpi}`}>
            <div>
              <p className={UI_TYPE.kpiLabel}>Tracked</p>
              <p className={UI_TYPE.kpiValue}>{summary.totalTracked}</p>
            </div>
            <div>
              <p className={UI_TYPE.kpiLabel}>Success rate</p>
              <p className={UI_TYPE.kpiValue}>{summary.overallSuccessRate}%</p>
            </div>
            <div>
              <p className={UI_TYPE.kpiLabel}>In progress</p>
              <p className={UI_TYPE.kpiValue}>{summary.inProgressCount}</p>
            </div>
            <div>
              <p className={UI_TYPE.kpiLabel}>Avg applicant gain</p>
              <p className={UI_TYPE.kpiValue}>+{summary.averageApplicantGain}</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <TypePerformanceTable title="Top performing types" rows={snapshot.topPerformingTypes} />
            <TypePerformanceTable title="Worst performing types" rows={snapshot.worstPerformingTypes} />
          </div>

          <section className={UI_SPACE.section}>
            <h3 className={UI_TYPE.sectionTitle}>ROI leaderboard</h3>
            <RoiLeaderboard rows={snapshot.roiLeaderboard} />
          </section>

          {snapshot.effectivenessTrends.length > 0 ? (
            <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
              <h3 className={UI_TYPE.sectionTitle}>Effectiveness trends</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[360px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                      <th className="pb-2 pr-3">Period</th>
                      <th className="pb-2 pr-3">Success rate</th>
                      <th className="pb-2 pr-3">Tracked</th>
                      <th className="pb-2">Highly effective</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.effectivenessTrends.map((row) => (
                      <tr key={row.period} className="border-b border-zinc-800/60">
                        <td className="py-2 pr-3 text-zinc-200">{row.period}</td>
                        <td className="py-2 pr-3 tabular-nums text-zinc-300">{row.successRate}%</td>
                        <td className="py-2 pr-3 text-zinc-400">{row.trackedCount}</td>
                        <td className="py-2 text-zinc-400">{row.highlyEffectiveCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className={UI_SPACE.section}>
            <h3 className={UI_TYPE.sectionTitle}>Recent recommendations</h3>
            <div className="grid gap-3">
              {snapshot.recentRecords.length === 0 ? (
                <WorkspaceEmptyState title="No recommendations" message="Sync from autopilot and daily actions." />
              ) : (
                snapshot.recentRecords.map((row) => (
                  <RecentRecordCard key={row.recommendationId} record={row} onExecute={executeRecommendation} />
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}
    </WorkspacePageShell>
  );
}
