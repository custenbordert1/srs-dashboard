"use client";

import { AutomationSyncStatusBanner } from "@/components/recruiting/automation-sync-status-banner";
import { CandidateIntelligenceSection } from "@/components/recruiting/candidate-intelligence-section";
import { IntelligenceBarChart } from "@/components/recruiting/intelligence-bar-chart";
import { RecruitingAlertsSection } from "@/components/recruiting/recruiting-alerts-section";
import { CandidateDetailDrawer } from "@/components/recruiting/candidate-detail-drawer";
import { useCandidateDrawer } from "@/hooks/use-candidate-drawer";
import { RecruiterDecisionIntelligencePanel } from "@/components/recruiting/recruiter-decision-intelligence-panel";
import { RecruiterOperationalKpiStrip } from "@/components/recruiting/recruiter-operational-kpi-strip";
import { RecruiterTopActionsPanel } from "@/components/recruiting/recruiter-top-actions-panel";
import { StaffingRiskHeatPanel } from "@/components/recruiting/staffing-risk-heat-panel";
import { useRecruitingIntelligence } from "@/hooks/use-recruiting-intelligence";
import { DashboardSectionFallback } from "@/components/ui/dashboard-section-fallback";
import { useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import { buildRecruiterOperationalKpis } from "@/lib/recruiting-dashboard-ux/recruiter-operational-kpis";
import { buildTopRecommendedActions } from "@/lib/recruiting-dashboard-ux/top-recommended-actions";
import type { JobCandidateRanking, SmartTerritoryAlert } from "@/lib/recruiting-automation";
import type { RecruitingRecommendation } from "@/lib/recruiting-recommendation-engine";
import { useMemo } from "react";

type RecruitingAutomationSectionProps = {
  compact?: boolean;
};

const URGENCY_STYLES: Record<RecruitingRecommendation["urgency"], string> = {
  critical: "border-red-500/30 bg-red-500/5",
  high: "border-amber-500/30 bg-amber-500/5",
  medium: "border-zinc-700 bg-zinc-950/50",
  low: "border-zinc-800 bg-zinc-950/40",
};

function AlertList({ alerts, empty }: { alerts: SmartTerritoryAlert[]; empty: string }) {
  if (alerts.length === 0) return <p className="text-sm text-zinc-500">{empty}</p>;
  return (
    <ul className="space-y-2">
      {alerts.map((alert) => (
        <li
          key={alert.id}
          className={`rounded-lg border px-3 py-2 text-sm ${
            alert.severity === "critical"
              ? "border-red-500/30 bg-red-500/10 text-red-100"
              : "border-amber-500/30 bg-amber-500/10 text-amber-100"
          }`}
        >
          <p className="font-medium">{alert.title}</p>
          <p className="mt-0.5 text-xs opacity-90">{alert.detail}</p>
        </li>
      ))}
    </ul>
  );
}

function JobRankingsTable({
  rankings,
  maxJobs,
  onCandidateClick,
}: {
  rankings: JobCandidateRanking[];
  maxJobs: number;
  onCandidateClick?: (candidateId: string) => void;
}) {
  if (rankings.length === 0) {
    return <p className="text-sm text-zinc-500">No job rankings available.</p>;
  }
  return (
    <div className="space-y-4">
      {rankings.slice(0, maxJobs).map((job) => (
        <article key={job.jobId} className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3">
          <div>
            <p className="font-medium text-zinc-100">{job.jobName}</p>
            <p className="text-xs text-zinc-500">
              {job.city}, {job.state} · {job.applicantCount} applicants
            </p>
          </div>
          {job.topCandidates.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-600">No ranked candidates yet.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {job.topCandidates.map((row, index) => (
                <li
                  key={row.candidateId}
                  role={onCandidateClick ? "button" : undefined}
                  tabIndex={onCandidateClick ? 0 : undefined}
                  onClick={onCandidateClick ? () => onCandidateClick(row.candidateId) : undefined}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-900/60 px-2 py-1.5 text-xs ${
                    onCandidateClick ? "cursor-pointer hover:bg-zinc-800/80" : ""
                  }`}
                >
                  <span className="text-zinc-300">
                    #{index + 1} {row.name}
                  </span>
                  <span className="tabular-nums text-teal-300">
                    {row.numericScore} · {row.tierLabel}
                  </span>
                  <span className="w-full text-zinc-500">{row.highlights.join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}

export function RecruitingAutomationSection({ compact = false }: RecruitingAutomationSectionProps) {
  const {
    data,
    meta,
    error,
    fatalError,
    loading,
    refreshing,
    timedOut,
    stale,
    lastSyncedAt,
    refresh,
  } = useRecruitingIntelligence({
    pollIntervalMs: compact ? 0 : undefined,
  });
  const loadingCeilingHit = useLoadingCeiling(loading && !data);
  const drawer = useCandidateDrawer({
    territoryStates: data?.territoryStates,
  });

  const topActions = useMemo(() => (data ? buildTopRecommendedActions(data, compact ? 6 : 10) : []), [data, compact]);
  const kpis = useMemo(
    () =>
      data
        ? buildRecruiterOperationalKpis(data, [], [], meta?.escalations ?? [])
        : [],
    [data, meta?.escalations],
  );
  const activeRepsByState = useMemo(
    () => new Map(Object.entries(meta?.activeRepsByState ?? {})),
    [meta?.activeRepsByState],
  );

  if (loading && !data) {
    return (
      <DashboardSectionFallback
        title="Recruiting automation"
        loadingMessage="Loading operational recommendations and intelligence…"
        isLoading
        loadingCeilingHit={loadingCeilingHit}
        timedOut={timedOut}
        onRetry={refresh}
        retrying={refreshing}
        skeletonRows={compact ? 2 : 4}
        skeletonCards={2}
      />
    );
  }

  if (!data && fatalError) {
    return (
      <DashboardSectionFallback
        title="Recruiting automation"
        error={fatalError}
        timedOut={timedOut}
        onRetry={refresh}
        retrying={refreshing}
        skeletonRows={compact ? 2 : 4}
        skeletonCards={2}
      />
    );
  }

  if (!data) return null;

  const alertLimit = compact ? 6 : 12;
  const jobLimit = compact ? 4 : 8;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Recruiting automation & intelligence</h2>
          <p className="text-sm text-zinc-500">
            Territory: {data.territoryLabel}
            {refreshing ? <span className="ml-2 text-teal-400/90">Updating…</span> : null}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
        >
          Refresh
        </button>
      </div>

      <AutomationSyncStatusBanner
        lastSyncedAt={lastSyncedAt}
        stale={stale}
        partialSync={meta?.partialSync}
        partialErrors={meta?.partialErrors}
        error={error}
        timedOut={timedOut}
        onRetry={refresh}
        retrying={refreshing}
      />

      <RecruiterTopActionsPanel actions={topActions} />
      <RecruiterOperationalKpiStrip kpis={kpis} />
      <StaffingRiskHeatPanel
        snapshot={data}
        escalations={meta?.escalations ?? []}
        activeRepsByState={activeRepsByState}
      />

      <RecruiterDecisionIntelligencePanel data={data.decisionIntelligence} compact={compact} />

      {!compact ? (
        <details className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
          <summary className="cursor-pointer text-base font-semibold text-zinc-50">
            Analytics & alerts
          </summary>
          <div className="mt-4 space-y-6">
            <RecruitingAlertsSection />
            <CandidateIntelligenceSection />
            <section>
              <h3 className="text-sm font-semibold text-zinc-100">Smart territory alerts</h3>
              <div className="mt-3">
                <AlertList
                  alerts={data.smartAlerts.slice(0, alertLimit)}
                  empty="No smart alerts for this territory."
                />
              </div>
            </section>
            <section>
              <h3 className="text-sm font-semibold text-zinc-100">Legacy AI recommendations</h3>
              <ul className="mt-3 space-y-2">
                {data.recommendations.slice(0, alertLimit).map((rec) => (
                  <li
                    key={rec.id}
                    className={`rounded-lg border px-3 py-2 text-sm ${URGENCY_STYLES[rec.urgency]}`}
                  >
                    <p className="font-medium text-zinc-200">{rec.recommendation}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{rec.reason}</p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </details>
      ) : null}

      {!compact ? (
        <details className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
          <summary className="cursor-pointer text-base font-semibold text-zinc-50">
            Executive snapshot & trends
          </summary>
          <div className="mt-4 space-y-4">
            <ul className="space-y-1.5 text-sm text-zinc-400">
              {data.dailySnapshot.summaryBullets.map((bullet) => (
                <li key={bullet}>• {bullet}</li>
              ))}
            </ul>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <IntelligenceBarChart
                title="Hottest territories"
                data={data.dailySnapshot.hottestTerritories}
                barClassName="bg-teal-500/80"
              />
              <IntelligenceBarChart
                title="Highest risk territories"
                data={data.dailySnapshot.highestRiskTerritories}
                barClassName="bg-red-500/70"
              />
              <IntelligenceBarChart
                title="Best recruiting sources"
                data={data.dailySnapshot.bestRecruitingSources}
                barClassName="bg-violet-500/80"
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <IntelligenceBarChart
                title="Applicants per day"
                subtitle="Last 14 days"
                data={data.trends.applicantsPerDay}
                barClassName="bg-sky-500/80"
              />
              <IntelligenceBarChart
                title="Hires per week"
                subtitle="Rolling 8 weeks"
                data={data.trends.hiresPerWeek}
                barClassName="bg-emerald-500/80"
              />
            </div>
          </div>
        </details>
      ) : null}

      <details className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <summary className="cursor-pointer text-base font-semibold text-zinc-50">
          Candidate ranking & productivity
        </summary>
        <div className="mt-4 space-y-4">
          <JobRankingsTable
            rankings={data.jobRankings}
            maxJobs={jobLimit}
            onCandidateClick={drawer.openCandidate}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                  <th className="pb-2 pr-3">Recruiter</th>
                  <th className="pb-2 pr-3">Reviewed</th>
                  <th className="pb-2 pr-3">Interviews</th>
                  <th className="pb-2 pr-3">Hires</th>
                  <th className="pb-2 pr-3">Response</th>
                  <th className="pb-2">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {data.productivity.slice(0, compact ? 6 : 12).map((row) => (
                  <tr key={row.recruiter} className="border-b border-zinc-800/60">
                    <td className="py-2 pr-3 font-medium text-zinc-200">{row.recruiter}</td>
                    <td className="py-2 pr-3 text-zinc-400">{row.candidatesReviewed}</td>
                    <td className="py-2 pr-3 text-zinc-400">{row.interviewsScheduled}</td>
                    <td className="py-2 pr-3 text-zinc-400">{row.hires}</td>
                    <td className="py-2 pr-3 text-zinc-400">{row.responseSpeedLabel}</td>
                    <td className="py-2 text-zinc-400">
                      {row.conversionPercent != null ? `${row.conversionPercent}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <CandidateDetailDrawer {...drawer.drawerProps} />
    </div>
  );
}
