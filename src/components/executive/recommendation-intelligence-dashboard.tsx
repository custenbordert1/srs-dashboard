"use client";

import { ExecutiveDataWarningBanner } from "@/components/executive/executive-data-warning-banner";
import { RoiCategoryBadge, TrustFlagBadge } from "@/components/executive/trust-flag-badge";
import { WorkspaceEmptyState } from "@/components/ui/workspace-empty-state";
import { WorkspacePageShell } from "@/components/ui/workspace-page-shell";
import type { ActionPerformanceRow, ActualVsExpectedRow } from "@/lib/executive-trust-roi/types";
import {
  fetchExecutiveIntelligenceRoute,
  scheduleExecutiveBackgroundRefresh,
} from "@/lib/executive-routes/executive-intelligence-client";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
import type {
  EffectivenessRating,
  RecommendationIntelligenceSnapshot,
  RecommendationOwnerPerformance,
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
  trustRows,
}: {
  title: string;
  rows: RecommendationTypePerformance[];
  trustRows?: ActionPerformanceRow[];
}) {
  if (rows.length === 0) {
    return (
      <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
        <h3 className={UI_TYPE.sectionTitle}>{title}</h3>
        <p className="text-sm text-zinc-500">No scored recommendation types yet.</p>
      </section>
    );
  }
  const trustByType = new Map((trustRows ?? []).map((row) => [row.recommendationType, row]));
  return (
    <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
      <h3 className={UI_TYPE.sectionTitle}>{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
              <th className="pb-2 pr-3">Type</th>
              <th className="pb-2 pr-3">Success</th>
              <th className="pb-2 pr-3">ROI</th>
              <th className="pb-2 pr-3">Trust</th>
              <th className="pb-2 pr-3">Tracked</th>
              <th className="pb-2">Avg gain</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const trust = trustByType.get(row.recommendationType);
              return (
                <tr key={row.recommendationType} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 font-medium text-zinc-200">{row.label}</td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-300">{row.successRate}%</td>
                  <td className="py-2 pr-3">
                    {trust ? <RoiCategoryBadge category={trust.roiCategory} /> : <span className="text-zinc-500">—</span>}
                  </td>
                  <td className="py-2 pr-3">
                    {trust ? <TrustFlagBadge flag={trust.trustFlag} /> : <span className="text-zinc-500">—</span>}
                  </td>
                  <td className="py-2 pr-3 text-zinc-400">{row.totalTracked}</td>
                  <td className="py-2 text-zinc-400">+{trust?.averageApplicantGain ?? row.averageApplicantGain}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OwnerPerformanceTable({
  title,
  rows,
}: {
  title: string;
  rows: RecommendationOwnerPerformance[];
}) {
  if (rows.length === 0) return null;
  return (
    <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
      <h3 className={UI_TYPE.sectionTitle}>{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
              <th className="pb-2 pr-3">Owner</th>
              <th className="pb-2 pr-3">Success</th>
              <th className="pb-2 pr-3">Tracked</th>
              <th className="pb-2">Completed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.ownerKind}:${row.owner}`} className="border-b border-zinc-800/60">
                <td className="py-2 pr-3 font-medium text-zinc-200">{row.owner}</td>
                <td className="py-2 pr-3 tabular-nums text-zinc-300">{row.successRate}%</td>
                <td className="py-2 pr-3 text-zinc-400">{row.trackedCount}</td>
                <td className="py-2 text-zinc-400">{row.completedCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ActualVsExpectedTable({ rows }: { rows: ActualVsExpectedRow[] }) {
  if (rows.length === 0) {
    return <WorkspaceEmptyState title="No outcome comparisons" message="Execute recommendations to compare expected vs actual." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
            <th className="pb-2 pr-3">Action</th>
            <th className="pb-2 pr-3">Expected</th>
            <th className="pb-2 pr-3">Actual</th>
            <th className="pb-2 pr-3">Effectiveness</th>
            <th className="pb-2 pr-3">ROI</th>
            <th className="pb-2">Trust</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.recommendationId} className="border-b border-zinc-800/60">
              <td className="py-2 pr-3 font-medium text-zinc-200">{row.label}</td>
              <td className="py-2 pr-3 text-zinc-400">+{row.expectedApplicantGain} applicants</td>
              <td className="py-2 pr-3 text-zinc-300">+{row.actualApplicantGain}</td>
              <td className="py-2 pr-3 text-zinc-400">{row.effectiveness ?? "Pending"}</td>
              <td className="py-2 pr-3">
                <RoiCategoryBadge category={row.roiCategory} />
              </td>
              <td className="py-2">
                <TrustFlagBadge flag={row.trustFlag} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
  trustFlag,
  onExecute,
}: {
  record: RecommendationRecord;
  trustFlag?: import("@/lib/executive-trust-roi/types").TrustFlag;
  onExecute: (id: string) => void;
}) {
  return (
    <article className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-zinc-50">{record.expectedOutcome}</p>
            {trustFlag ? <TrustFlagBadge flag={trustFlag} /> : null}
          </div>
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
  const trustRoi = snapshot?.trustRoi;
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

          {trustRoi ? (
            <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
              <h3 className={UI_TYPE.sectionTitle}>Executive impact</h3>
              <div className={`${UI_SPACE.gridKpi} mt-2`}>
                <div>
                  <p className={UI_TYPE.kpiLabel}>Applicants</p>
                  <p className={UI_TYPE.kpiValue}>+{trustRoi.executiveImpact.applicantsGenerated}</p>
                </div>
                <div>
                  <p className={UI_TYPE.kpiLabel}>Interviews</p>
                  <p className={UI_TYPE.kpiValue}>+{trustRoi.executiveImpact.interviewsGenerated}</p>
                </div>
                <div>
                  <p className={UI_TYPE.kpiLabel}>Hires</p>
                  <p className={UI_TYPE.kpiValue}>+{trustRoi.executiveImpact.hiresGenerated}</p>
                </div>
                <div>
                  <p className={UI_TYPE.kpiLabel}>Coverage</p>
                  <p className={UI_TYPE.kpiValue}>+{trustRoi.executiveImpact.coverageGained}%</p>
                </div>
                <div>
                  <p className={UI_TYPE.kpiLabel}>Open calls reduced</p>
                  <p className={UI_TYPE.kpiValue}>{trustRoi.executiveImpact.openCallsReduced}</p>
                </div>
                <div>
                  <p className={UI_TYPE.kpiLabel}>Projects improved</p>
                  <p className={UI_TYPE.kpiValue}>{trustRoi.executiveImpact.projectsImproved}</p>
                </div>
                <div>
                  <p className={UI_TYPE.kpiLabel}>Risks reduced</p>
                  <p className={UI_TYPE.kpiValue}>{trustRoi.executiveImpact.risksReduced}</p>
                </div>
                <div>
                  <p className={UI_TYPE.kpiLabel}>Scored actions</p>
                  <p className={UI_TYPE.kpiValue}>
                    {trustRoi.executiveImpact.scoredActions}/{trustRoi.executiveImpact.trackedActions}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <TypePerformanceTable
              title="Top performing actions"
              rows={snapshot.topPerformingTypes}
              trustRows={trustRoi?.topPerformingActions}
            />
            <TypePerformanceTable
              title="Worst performing actions"
              rows={snapshot.worstPerformingTypes}
              trustRows={trustRoi?.worstPerformingActions}
            />
          </div>

          {trustRoi ? (
            <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
              <h3 className={UI_TYPE.sectionTitle}>Actual vs expected outcomes</h3>
              <ActualVsExpectedTable rows={trustRoi.actualVsExpected} />
            </section>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <OwnerPerformanceTable title="Success by DM" rows={snapshot.successRateByDm} />
            <OwnerPerformanceTable title="Success by recruiter" rows={snapshot.successRateByRecruiter} />
            <OwnerPerformanceTable title="Success by project" rows={snapshot.successRateByProject} />
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
                  <RecentRecordCard
                    key={row.recommendationId}
                    record={row}
                    trustFlag={trustRoi?.trustByType[row.recommendationType]}
                    onExecute={executeRecommendation}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}
    </WorkspacePageShell>
  );
}
