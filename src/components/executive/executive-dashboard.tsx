"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AppShell } from "@/components/auth/app-shell";
import { IntelligenceBarChart } from "@/components/recruiting/intelligence-bar-chart";
import { RecruitingAutomationSection } from "@/components/recruiting/recruiting-automation-section";
import type { UserPublic } from "@/lib/auth/types";
import type { ExecutiveDashboardSnapshot } from "@/lib/dm-dashboard";
import { CandidateDetailDrawer } from "@/components/recruiting/candidate-detail-drawer";
import { ExecutiveMelMatchingPanel } from "@/components/recruiting/mel-matching-metrics-panel";
import { NotificationCriticalAlertsPanel } from "@/components/notifications/notification-critical-alerts-panel";
import { ExecutiveActionCenterSummary } from "@/components/recruiting/ai-command-center/executive-action-center-summary";
import { CoverageOptimizationExecutiveSummary } from "@/components/coverage-optimization/coverage-optimization-executive-summary";
import { WorkforceOpsExecutiveSummary } from "@/components/workforce-ops/workforce-ops-executive-summary";
import { CoverageRiskSection } from "@/components/recruiting/coverage-risk-section";
import { WorkforceOperationsSection } from "@/components/recruiting/workforce-operations-section";
import { DeferredSection } from "@/components/ui/deferred-section";
import { DataTrustBadge, DataTrustStatusBanner } from "@/components/ui/data-trust-badge";
import { TrustGatedKpiShell } from "@/components/ui/trust-gated-kpi";
import { useCandidateDrawer } from "@/hooks/use-candidate-drawer";
import { useTerritoryDashboard } from "@/hooks/use-territory-dashboard";
import { applicantsPerOpeningFromAts } from "@/lib/breezy-ats-reporting";
import { breezyAtsToDataTrustInput } from "@/lib/breezy-ats-metrics";
import { BreezyAtsSyncStatus } from "@/components/recruiting/breezy-ats-sync-status";
import type { DataTrustInput, DataTrustState } from "@/lib/data-trust-state";
import { resolveKpiTrustPresentation } from "@/lib/kpi-trust-gating";
import { useMemo } from "react";

type ExecutiveDashboardProps = {
  user: UserPublic;
};

function TerritoryTable({
  title,
  rows,
  trustState,
  trustInput,
}: {
  title: string;
  rows: ExecutiveDashboardSnapshot["bestTerritories"];
  trustState: DataTrustState;
  trustInput: DataTrustInput;
}) {
  const healthPresentation = () =>
    resolveKpiTrustPresentation(trustState, "health-score", "executive-territory-row", trustInput);
  const apps7dPresentation = () =>
    resolveKpiTrustPresentation(trustState, "candidates-7d", "executive-territory-row", trustInput);
  const totalPresentation = () =>
    resolveKpiTrustPresentation(trustState, "candidates-total", "executive-territory-row", trustInput);

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No territory data.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">DM</th>
                <th className="pb-2 pr-3">Health</th>
                <th className="pb-2 pr-3">Jobs</th>
                <th className="pb-2 pr-3">7d apps</th>
                <th className="pb-2">Candidates</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const health = healthPresentation();
                const apps7d = apps7dPresentation();
                const total = totalPresentation();
                return (
                  <tr key={row.dmName} className="border-b border-zinc-800/60">
                    <td className="py-2 pr-3 font-medium text-zinc-200">{row.dmName}</td>
                    <td
                      className={`py-2 pr-3 tabular-nums text-zinc-300 ${health.dim ? "opacity-55" : ""}`}
                    >
                      {row.healthScore}{" "}
                      <span className="text-xs text-zinc-500">({row.healthLabel})</span>
                    </td>
                    <td className="py-2 pr-3 text-zinc-400">{row.activeJobs}</td>
                    <td
                      className={`py-2 pr-3 text-zinc-400 ${apps7d.dim ? "opacity-55" : ""}`}
                    >
                      {row.candidatesLast7Days}
                    </td>
                    <td className={`py-2 text-zinc-400 ${total.dim ? "opacity-55" : ""}`}>
                      {row.candidates}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ExecutiveMetricCard({
  statId,
  className,
  label,
  value,
  hint,
  trustState,
  trustInput,
}: {
  statId: string;
  className: string;
  label: string;
  value: ReactNode;
  hint?: string;
  trustState: DataTrustState;
  trustInput: DataTrustInput;
}) {
  const presentation = resolveKpiTrustPresentation(
    trustState,
    statId,
    "executive-dashboard",
    trustInput,
  );
  return (
    <TrustGatedKpiShell presentation={presentation} className={className}>
      <article>
        <p className="text-xs uppercase tracking-wide opacity-80">{label}</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="mt-1 text-xs opacity-70">{hint}</p> : null}
      </article>
    </TrustGatedKpiShell>
  );
}

function ExecutiveStatCell({
  statId,
  label,
  value,
  trustState,
  trustInput,
}: {
  statId: string;
  label: string;
  value: string | number;
  trustState: DataTrustState;
  trustInput: DataTrustInput;
}) {
  const presentation = resolveKpiTrustPresentation(
    trustState,
    statId,
    "executive-dashboard",
    trustInput,
  );
  return (
    <TrustGatedKpiShell
      presentation={presentation}
      className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3"
    >
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-100">{value}</p>
    </TrustGatedKpiShell>
  );
}

export function ExecutiveDashboard({ user }: ExecutiveDashboardProps) {
  const {
    data,
    meta,
    error,
    loading,
    refreshing,
    timedOut,
    refresh,
    dataTrust,
  } = useTerritoryDashboard<ExecutiveDashboardSnapshot>({
    endpoint: "/api/executive/dashboard",
    cacheScope: user.id,
  });
  const drawer = useCandidateDrawer();
  const trustInput: DataTrustInput = useMemo(() => {
    if (meta?.ats) {
      return breezyAtsToDataTrustInput(meta.ats, { loading, refreshing, error, timedOut });
    }
    return {
      loading,
      refreshing,
      error,
      timedOut,
      hasData: Boolean(data),
      partialSync: meta?.partialSync,
      scanMode: meta?.scanMode,
      positionsScanned: meta?.positionsScanned,
      totalPositionsAvailable: meta?.totalPositionsAvailable,
    };
  }, [data, error, loading, meta, refreshing, timedOut]);

  return (
    <AppShell
      user={user}
      title="Executive nationwide rollup"
      subtitle={`Nationwide health ${data?.nationwideHealthScore ?? "—"}/100 · live Breezy rollup`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-zinc-500">
            Best/worst territories, sources, fill-rate trends, weekly candidates
          </p>
          <DataTrustBadge trust={trustInput} state={dataTrust} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/executive/workforce-intelligence"
            className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-200 hover:bg-teal-500/20"
          >
            Workforce Intelligence
          </Link>
          <button
            type="button"
            onClick={refresh}
            disabled={loading || refreshing}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
          >
            {loading ? "Loading…" : refreshing ? "Refreshing…" : "Refresh now"}
          </button>
        </div>
      </div>

      <DataTrustStatusBanner
        trust={trustInput}
        state={dataTrust}
        onRetry={refresh}
        retrying={refreshing}
      />

      {meta?.ats ? (
        <BreezyAtsSyncStatus metrics={meta.ats} compact={meta.ats.syncTier === "full"} />
      ) : null}

      {loading && !data ? <p className="text-sm text-zinc-500">Loading executive rollup…</p> : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ExecutiveMetricCard
              statId="territory-health"
              className="rounded-2xl border border-teal-500/30 bg-teal-500/10 px-5 py-4 text-teal-100 transition-transform duration-300 hover:-translate-y-0.5"
              label="Territory health"
              value={
                <>
                  {data.executiveInsights.territoryHealthScore}
                  <span className="text-base text-teal-200/60">/100</span>
                </>
              }
              hint={data.executiveInsights.territoryHealthLabel}
              trustState={dataTrust}
              trustInput={trustInput}
            />
            <ExecutiveMetricCard
              statId="fill-risk"
              className="rounded-2xl border border-red-500/25 bg-red-500/10 px-5 py-4 text-red-100 transition-transform duration-300 hover:-translate-y-0.5"
              label="Fill risk"
              value={data.executiveInsights.fillRiskScore}
              hint={data.executiveInsights.fillRiskLabel}
              trustState={dataTrust}
              trustInput={trustInput}
            />
            <ExecutiveMetricCard
              statId="recruiter-productivity"
              className="rounded-2xl border border-violet-500/25 bg-violet-500/10 px-5 py-4 text-violet-100 transition-transform duration-300 hover:-translate-y-0.5"
              label="Recruiter productivity"
              value={data.executiveInsights.recruiterProductivityScore}
              trustState={dataTrust}
              trustInput={trustInput}
            />
            <ExecutiveMetricCard
              statId="pipeline-velocity"
              className="rounded-2xl border border-sky-500/25 bg-sky-500/10 px-5 py-4 text-sky-100 transition-transform duration-300 hover:-translate-y-0.5"
              label="Pipeline velocity"
              value={`${data.executiveInsights.pipelineVelocity}%`}
              hint="14d hire rate"
              trustState={dataTrust}
              trustInput={trustInput}
            />
          </div>

          {meta?.ats ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ExecutiveStatCell
                statId="ats-candidates-loaded"
                label="Candidates loaded"
                value={meta.ats.candidatesLoaded}
                trustState={dataTrust}
                trustInput={trustInput}
              />
              <ExecutiveStatCell
                statId="ats-active-jobs"
                label="Active jobs"
                value={meta.ats.publishedJobs}
                trustState={dataTrust}
                trustInput={trustInput}
              />
              <ExecutiveStatCell
                statId="ats-applicants-today"
                label="Applicants today"
                value={meta.ats.applicantsToday}
                trustState={dataTrust}
                trustInput={trustInput}
              />
              <ExecutiveStatCell
                statId="ats-applicants-7d"
                label="7d applicants"
                value={meta.ats.applicants7d}
                trustState={dataTrust}
                trustInput={trustInput}
              />
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ExecutiveStatCell
              statId="ats-applicants-per-opening"
              label="Applicants / opening"
              value={
                meta?.ats
                  ? applicantsPerOpeningFromAts(meta.ats)
                  : data.executiveInsights.applicantsPerOpening
              }
              trustState={dataTrust}
              trustInput={trustInput}
            />
            <ExecutiveStatCell
              statId="interviews-active"
              label="Interviews active"
              value={data.executiveInsights.interviewsActive}
              trustState={dataTrust}
              trustInput={trustInput}
            />
          </div>

          <ExecutiveMelMatchingPanel
            metrics={data.melMatching}
            onCandidateClick={drawer.openCandidate}
          />

          <NotificationCriticalAlertsPanel
            title="Executive alerts"
            description="Critical territories, workload spikes, and open calls at risk."
          />

          <WorkforceOpsExecutiveSummary />

          <CoverageOptimizationExecutiveSummary />

          <ExecutiveActionCenterSummary />

          <DeferredSection
            title="Coverage risk intelligence"
            description="Staffing risk, rep proximity, and pipeline signals for open MEL projects."
            summary={
              <p className="text-sm text-zinc-500">
                Expand to load predictive coverage analysis (cached ~90s after first load).
              </p>
            }
          >
            <CoverageRiskSection variant="executive" />
          </DeferredSection>

          <DeferredSection
            title="Workforce operations"
            description="Rep import, geocoded matching, and staffing recommendations."
            summary={
              <p className="text-sm text-zinc-500">
                Expand to load workforce intelligence and rep matching panels.
              </p>
            }
          >
            <WorkforceOperationsSection showPasswordPanel />
          </DeferredSection>

          <div className="grid gap-4 lg:grid-cols-2">
            <TerritoryTable
              title="Best territories"
              rows={data.bestTerritories}
              trustState={dataTrust}
              trustInput={trustInput}
            />
            <TerritoryTable
              title="Worst territories"
              rows={data.worstTerritories}
              trustState={dataTrust}
              trustInput={trustInput}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <IntelligenceBarChart
              title="Top recruiting sources"
              subtitle="Nationwide applicant sources"
              data={data.topRecruitingSources}
              barClassName="bg-violet-500/80"
            />
            <IntelligenceBarChart
              title="Conversion funnel"
              subtitle="Stage distribution (%)"
              data={data.executiveInsights.conversionFunnel}
              valueLabel="%"
              barClassName="bg-emerald-500/80"
            />
            <IntelligenceBarChart
              title="Hiring momentum"
              subtitle="Weekly applicant trend"
              data={data.executiveInsights.hiringMomentumTrend}
              barClassName="bg-teal-500/80"
            />
            <IntelligenceBarChart
              title="Total candidates by week"
              subtitle="Rolling 8-week applicant volume"
              data={data.candidatesByWeek}
              barClassName="bg-sky-500/80"
            />
          </div>

          <DeferredSection
            title="Recruiting automation"
            description="Daily executive snapshot and automation signals."
            summary={<p className="text-sm text-zinc-500">Expand to load automation rollup.</p>}
          >
            <section className="border-t border-zinc-800/80 pt-4">
              <RecruitingAutomationSection />
            </section>
          </DeferredSection>

          <p className="text-xs text-zinc-600">
            Snapshot {new Date(data.fetchedAt).toLocaleString()} · {data.territoryRollups.length} DM territories
          </p>
        </>
      ) : null}

      <CandidateDetailDrawer {...drawer.drawerProps} />
    </AppShell>
  );
}
