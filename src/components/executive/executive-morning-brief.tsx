"use client";

import { ExecutiveDataWarningBanner } from "@/components/executive/executive-data-warning-banner";
import { WorkspacePageShell } from "@/components/ui/workspace-page-shell";
import {
  downloadMorningBriefExcel,
  downloadMorningBriefPdfViaPrint,
  openMorningBriefPrintView,
} from "@/lib/executive-morning-brief/build-export";
import type { ExecutiveMorningBriefSnapshot } from "@/lib/executive-morning-brief/types";
import {
  fetchExecutiveIntelligenceRoute,
  scheduleExecutiveBackgroundRefresh,
} from "@/lib/executive-routes/executive-intelligence-client";
import type { ExecutiveIntelligenceRouteMeta } from "@/lib/executive-routes/executive-intelligence-route";
import {
  UI_BADGE,
  UI_BUTTON,
  UI_LAYOUT,
  UI_SPACE,
  UI_SURFACE,
  UI_TYPE,
} from "@/lib/ui-tokens";
import { useCallback, useEffect, useState } from "react";

const RISK_BADGE: Record<string, string> = {
  critical: UI_BADGE.critical,
  high: UI_BADGE.high,
  moderate: UI_BADGE.moderate,
  stable: UI_BADGE.neutral,
  healthy: UI_BADGE.healthy,
};

function ScorecardGrid({ snapshot }: { snapshot: ExecutiveMorningBriefSnapshot }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {snapshot.scorecard.map((metric) => (
        <article key={metric.key} className={`${UI_SURFACE.panel} p-4`}>
          <p className="text-xs uppercase tracking-wide text-zinc-500">{metric.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">
            {metric.format === "percent" ? `${metric.value}%` : metric.value.toLocaleString()}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            {metric.trends.vsLastWeek.label} vs last week · {metric.trends.vsYesterday.label} vs yesterday
          </p>
        </article>
      ))}
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
      setError(loadError instanceof Error ? loadError.message : "Failed to load morning brief");
      setLoaded(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <WorkspacePageShell
      loading={loading && !loaded}
      error={error}
      hasData={loaded}
      loadingMessage="Building executive morning brief…"
      emptyTitle="Morning brief unavailable"
      emptyMessage="Intelligence cache has not produced a briefing yet."
      onRefresh={() => void load(true)}
      partialDataAvailable={loaded}
    >
      {snapshot ? (
        <div id="executive-morning-brief" className={UI_SPACE.page}>
          <ExecutiveDataWarningBanner meta={routeMeta} onRefresh={() => void load(true)} />

          <div className={UI_LAYOUT.pageHeader}>
            <div>
              <h2 className={UI_TYPE.pageTitle}>Executive Morning Brief</h2>
              <p className={UI_TYPE.pageSubtitle}>
                Leadership briefing for {snapshot.planDate} — recruiting health, risks, forecasts, and priorities in one view.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={UI_BUTTON.secondary} onClick={() => downloadMorningBriefExcel(snapshot)}>
                Export Excel
              </button>
              <button type="button" className={UI_BUTTON.secondary} onClick={() => downloadMorningBriefPdfViaPrint(snapshot)}>
                Export PDF
              </button>
              <button type="button" className={UI_BUTTON.secondary} onClick={() => openMorningBriefPrintView(snapshot)}>
                Print View
              </button>
              <button type="button" className={UI_BUTTON.primary} disabled={refreshing} onClick={() => void load(true)}>
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
            <h3 className={UI_TYPE.sectionTitle}>Today&apos;s Narrative</h3>
            <p className="text-sm leading-relaxed text-zinc-200">{snapshot.narratives.today}</p>
            <p className="text-sm text-zinc-400">{snapshot.narratives.thisWeek}</p>
            <p className="text-sm text-zinc-500">{snapshot.narratives.outlook30Day}</p>
          </section>

          <section className={UI_SPACE.stackSm}>
            <h3 className={UI_TYPE.sectionTitle}>Executive Scorecard</h3>
            <ScorecardGrid snapshot={snapshot} />
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
              <h3 className={UI_TYPE.sectionTitle}>Top 10 Daily Priorities</h3>
              <div className="space-y-3">
                {snapshot.dailyPriorities.map((row) => (
                  <article key={row.sourceId} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-100">
                          {row.rank}. {row.title}
                        </p>
                        <p className="text-xs text-zinc-500">{row.owner ?? "Unassigned"} · Impact {row.impactScore}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-zinc-400">{row.recommendedAction}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
              <h3 className={UI_TYPE.sectionTitle}>Territory Risk Summary</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                      <th className="pb-2 pr-3">#</th>
                      <th className="pb-2 pr-3">Territory</th>
                      <th className="pb-2 pr-3">Risk</th>
                      <th className="pb-2 pr-3">Coverage</th>
                      <th className="pb-2">Open Calls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.territoryRisks.map((row) => (
                      <tr key={row.territoryLabel} className="border-b border-zinc-800/60">
                        <td className="py-2 pr-3 text-zinc-400">{row.rank}</td>
                        <td className="py-2 pr-3 font-medium text-zinc-200">{row.territoryLabel}</td>
                        <td className="py-2 pr-3">
                          <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${RISK_BADGE[row.riskLevel] ?? UI_BADGE.neutral}`}>
                            {row.riskLevel}
                          </span>
                        </td>
                        <td className="py-2 pr-3 tabular-nums">{row.coveragePercent}%</td>
                        <td className="py-2 tabular-nums">{row.openCalls}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
              <h3 className={UI_TYPE.sectionTitle}>Recruiter Performance</h3>
              <p className="text-xs text-zinc-500">Top performers</p>
              {snapshot.recruiterPerformance.topPerformers.map((row) => (
                <p key={row.recruiter} className="text-sm text-zinc-300">
                  {row.recruiter} — score {row.productivityScore}
                </p>
              ))}
              <p className="mt-3 text-xs text-zinc-500">Needs attention</p>
              {snapshot.recruiterPerformance.needsAttention.map((row) => (
                <p key={row.recruiter} className="text-sm text-amber-100/90">
                  {row.recruiter} — {row.pipelineHealth} pipeline
                </p>
              ))}
            </section>

            <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
              <h3 className={UI_TYPE.sectionTitle}>Coverage Forecast</h3>
              {snapshot.coverageForecast.map((row) => (
                <div key={row.horizon} className="flex items-center justify-between border-b border-zinc-800/60 py-2 text-sm">
                  <span className="text-zinc-300">{row.horizon}</span>
                  <span className="text-zinc-400">
                    {row.expectedCoveragePercent}% coverage · {row.expectedOpenCalls} open calls
                  </span>
                </div>
              ))}
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
              <h3 className={UI_TYPE.sectionTitle}>Automation Opportunities</h3>
              <div className="grid grid-cols-2 gap-2 text-sm text-zinc-300">
                <span>Job refresh drafts: {snapshot.automationOpportunities.jobRefreshDrafts}</span>
                <span>Posting drafts: {snapshot.automationOpportunities.postingDrafts}</span>
                <span>Campaign drafts: {snapshot.automationOpportunities.followUpCampaigns}</span>
                <span>Pending approval: {snapshot.automationOpportunities.pendingApprovals}</span>
              </div>
            </section>

            <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
              <h3 className={UI_TYPE.sectionTitle}>Recommendation Intelligence</h3>
              <p className="text-sm text-zinc-300">
                Overall success rate: {snapshot.recommendationIntelligence.overallSuccessRate}%
              </p>
              {snapshot.recommendationIntelligence.topPerforming.slice(0, 3).map((row) => (
                <p key={row.recommendationType} className="text-sm text-emerald-100/90">
                  {row.label}: {row.successRate}% success
                </p>
              ))}
              {snapshot.recommendationIntelligence.worstPerforming.slice(0, 2).map((row) => (
                <p key={`worst-${row.recommendationType}`} className="text-sm text-amber-100/90">
                  {row.label}: {row.successRate}% success
                </p>
              ))}
            </section>
          </div>

          <section className={`${UI_SURFACE.panel} ${UI_SPACE.stackSm}`}>
            <h3 className={UI_TYPE.sectionTitle}>Email Digest Draft</h3>
            <p className="text-xs text-zinc-500">Draft only — no automatic email sending.</p>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300 whitespace-pre-wrap">
              {snapshot.emailDigest.bodyText}
            </pre>
          </section>
        </div>
      ) : null}
    </WorkspacePageShell>
  );
}
