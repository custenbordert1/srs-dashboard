"use client";

import { AtsHealthCard } from "@/components/executive/ats-health-card";
import { ExecutiveAccountabilitySummary } from "@/components/executive/executive-accountability-summary";
import { ExecutiveActionsStrip } from "@/components/executive/executive-actions-strip";
import { ExecutiveSnapshotHero } from "@/components/executive/executive-snapshot-hero";
import { ApplicantCaptureHealthPanel } from "@/components/recruiting/applicant-capture-health-panel";
import { AutomationHealthPanel } from "@/components/executive/automation-health-panel";
import { ExecutionHealthPanel } from "@/components/executive/execution-health-panel";
import { ExecutivePaperworkDashboardPanel } from "@/components/executive/executive-paperwork-dashboard-panel";
import { AutonomousOnboardingPanel } from "@/components/executive/autonomous-onboarding-panel";
import { AutonomousPaperworkPanel } from "@/components/executive/autonomous-paperwork-panel";
import { AutonomousPaperworkExecutionPanel } from "@/components/executive/autonomous-paperwork-execution-panel";
import { AutonomousCandidateCommunicationPanel } from "@/components/executive/autonomous-candidate-communication-panel";
import { ExecutiveDailyBriefPanel } from "@/components/executive/executive-daily-brief-panel";
import { AutonomousOperationsCenterPanel } from "@/components/executive/autonomous-operations-center-panel";
import { AutonomousDecisionEnginePanel } from "@/components/executive/autonomous-decision-engine-panel";
import { AutonomousApprovalGovernancePanel } from "@/components/executive/autonomous-approval-governance-panel";
import { AutonomousRecruitingOrchestratorPanel } from "@/components/executive/autonomous-recruiting-orchestrator-panel";
import { ExecutiveNaturalLanguageQueriesPanel } from "@/components/executive/executive-natural-language-queries-panel";
import { WorkforcePlacementPanel } from "@/components/executive/workforce-placement-panel";
import { OnboardingHealthPanel } from "@/components/executive/onboarding-health-panel";
import { RecruiterAutomationReadinessPanel } from "@/components/executive/recruiter-automation-readiness-panel";
import { PipelineHealthPanel } from "@/components/executive/pipeline-health-panel";
import type { ExecutiveDashboardSnapshot, TerritoryRollupRow } from "@/lib/dm-dashboard";
import { buildExecutiveSnapshotContent } from "@/lib/build-executive-home-snapshot";
import { sanitizeFriendlyFetchMessage } from "@/lib/friendly-fetch-errors";
import { useAtsHealth } from "@/hooks/use-ats-health";
import { useTerritoryDashboard } from "@/hooks/use-territory-dashboard";
import { useExecutiveAccountability } from "@/hooks/use-executive-accountability";
import { usePipelineIntelligence } from "@/hooks/use-pipeline-intelligence";
import { useRecruitingIntelligence } from "@/hooks/use-recruiting-intelligence";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type KpiStatus = "normal" | "unavailable" | "pending";

function KpiCard({
  label,
  value,
  hint,
  loading,
  status = "normal",
}: {
  label: string;
  value: string | number;
  hint?: string;
  loading?: boolean;
  status?: KpiStatus;
}) {
  const valueClass =
    status === "unavailable" || status === "pending" ? "text-amber-200" : "text-zinc-50";

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-16 animate-pulse rounded bg-zinc-800/80" />
      ) : (
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
      )}
      {hint && !loading ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
      {status === "pending" && !loading ? (
        <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-amber-300/90">Sync pending</p>
      ) : null}
      {status === "unavailable" && !loading ? (
        <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-amber-300/90">Unavailable</p>
      ) : null}
    </div>
  );
}

function sortTerritories(rows: TerritoryRollupRow[], direction: "asc" | "desc", limit: number): TerritoryRollupRow[] {
  const sorted = [...rows].sort((a, b) =>
    direction === "asc" ? a.healthScore - b.healthScore : b.healthScore - a.healthScore,
  );
  return sorted.slice(0, limit);
}

function TerritoryTable({
  title,
  rows,
  loading,
  loadingCeilingHit,
}: {
  title: string;
  rows: TerritoryRollupRow[];
  loading?: boolean;
  loadingCeilingHit?: boolean;
}) {
  const showLoading = loading && !loadingCeilingHit;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
      {showLoading ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-8 animate-pulse rounded bg-zinc-800/80" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-500">
          Territory rollups will appear once dashboard data loads.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">DM</th>
                <th className="pb-2 pr-3">Health</th>
                <th className="pb-2 pr-3">Jobs</th>
                <th className="pb-2">Candidates</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.dmName} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 font-medium text-zinc-200">{row.dmName}</td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-300">
                    {row.healthScore}{" "}
                    <span className="text-xs text-zinc-500">({row.healthLabel})</span>
                  </td>
                  <td className="py-2 pr-3 text-zinc-400">{row.activeJobs}</td>
                  <td className="py-2 text-zinc-400">{row.candidates}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ExecutiveHomePanel() {
  const { data, meta, loading, error, timedOut, refresh } =
    useTerritoryDashboard<ExecutiveDashboardSnapshot>({
      endpoint: "/api/executive/dashboard",
      pollIntervalMs: 0,
    });
  const accountability = useExecutiveAccountability();
  const atsHealth = useAtsHealth();
  const pipeline = usePipelineIntelligence();
  const recruiting = useRecruitingIntelligence({ pollIntervalMs: 90_000 });
  const loadingCeilingHit = useLoadingCeiling(loading && !data, EXECUTIVE_PANEL_LOADING_CEILING_MS);

  const insights = data?.executiveInsights;
  const atsFallback = atsHealth.snapshot;
  const jobsAvailable =
    (meta?.jobsAvailable ?? false) ||
    (insights?.activeJobs ?? 0) > 0 ||
    (atsFallback?.jobsCached ?? 0) > 0;
  const candidatesUnavailable =
    meta?.candidatesUnavailable === true ||
    ((atsFallback?.candidatesCached ?? 0) === 0 && (insights?.totalCandidates ?? 0) === 0 && jobsAvailable);
  const candidatesSyncPending = candidatesUnavailable && (loading || atsHealth.loading) && !insights;
  const kpiLoading = loading && !data && !atsFallback && !loadingCeilingHit;

  const openJobs = insights?.activeJobs ?? (jobsAvailable ? atsFallback?.jobsCached ?? 0 : 0);
  const candidatesValue = candidatesSyncPending
    ? "Sync pending"
    : candidatesUnavailable
      ? "Unavailable"
      : (insights?.totalCandidates ?? atsFallback?.candidatesCached ?? 0).toLocaleString();
  const candidatesStatus: KpiStatus = candidatesSyncPending
    ? "pending"
    : candidatesUnavailable
      ? "unavailable"
      : "normal";

  const lastUpdated = meta?.refreshedAt ?? data?.fetchedAt ?? atsFallback?.lastSuccessfulSync;
  const friendlyRollupError = error
    ? sanitizeFriendlyFetchMessage(error, "dashboard", { timedOut }) ?? error
    : null;

  const snapshot = buildExecutiveSnapshotContent({
    insights,
    data,
    accountability: accountability.snapshot,
    pipeline: pipeline.data,
    alerts: recruiting.data?.recruitingAlerts,
    automationRollups: recruiting.data?.executiveAutomationRollups,
    candidatesUnavailable,
  });

  const riskTerritories = sortTerritories(data?.territoryRollups ?? [], "asc", 10);
  const healthyTerritories = sortTerritories(data?.territoryRollups ?? [], "desc", 10);

  const needsAttentionCount =
    recruiting.data?.recruitingAlerts.filter((alert) => alert.severity === "critical" || alert.severity === "warning")
      .length ?? 0;
  const pipelineBottleneckCount =
    pipeline.data?.executive.topBottleneckTerritories.length ??
    pipeline.data?.executive.topBottlenecks.length ??
    0;
  const overdueCount = accountability.snapshot?.statusSummary.overdue ?? 0;
  const openActions = accountability.snapshot?.statusSummary.open ?? 0;
  const accountabilityHeadline =
    accountability.snapshot?.weeklyNarrative?.topActionRequired ??
    accountability.snapshot?.weeklyNarrative?.topRiskThisWeek ??
    null;

  const showCoverageKpis = Boolean(insights) || kpiLoading;
  const showOpenJobsKpi = jobsAvailable || openJobs > 0 || kpiLoading;
  const assignmentRollups = recruiting.data?.executiveAutomationRollups;
  const assignmentRollupsLoading = recruiting.loading && !assignmentRollups;
  const assignmentRollupsError =
    !assignmentRollups && !recruiting.loading
      ? sanitizeFriendlyFetchMessage(recruiting.error ?? "", "dashboard", { timedOut: recruiting.timedOut }) ??
        recruiting.error
      : null;

  return (
    <div className="space-y-6">
      <ExecutiveSnapshotHero snapshot={snapshot} lastUpdated={formatTimestamp(lastUpdated)} />

      <ApplicantCaptureHealthPanel />

      <AutomationHealthPanel />

      <ExecutionHealthPanel />

      <OnboardingHealthPanel />

      <AutonomousPaperworkPanel />

      <AutonomousPaperworkExecutionPanel />

      <AutonomousOnboardingPanel />

      <WorkforcePlacementPanel />

      <ExecutiveDailyBriefPanel />

      <AutonomousCandidateCommunicationPanel />

      <AutonomousRecruitingOrchestratorPanel />

      <AutonomousOperationsCenterPanel />

      <AutonomousDecisionEnginePanel />

      <AutonomousApprovalGovernancePanel />

      <ExecutiveNaturalLanguageQueriesPanel />

      <ExecutivePaperworkDashboardPanel />

      <RecruiterAutomationReadinessPanel />

      {candidatesUnavailable && jobsAvailable ? (
        <div
          role="status"
          className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          Job data is current; candidate cache is still warming. Pipeline metrics may be partial until sync completes.
        </div>
      ) : null}

      {friendlyRollupError && !data ? (
        <div
          role="status"
          className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          <p>{friendlyRollupError}</p>
          <button
            type="button"
            onClick={() => refresh()}
            className="mt-2 rounded-lg border border-amber-400/40 px-3 py-1 text-xs font-medium hover:bg-amber-500/20"
          >
            Retry
          </button>
        </div>
      ) : null}

      <section>
        <h2 className="text-lg font-semibold text-zinc-50">Executive KPIs</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {showOpenJobsKpi ? (
            <KpiCard label="Open jobs" value={openJobs.toLocaleString()} loading={kpiLoading && !jobsAvailable} />
          ) : null}
          <KpiCard
            label="Candidates"
            value={candidatesValue}
            loading={kpiLoading && candidatesStatus === "normal"}
            status={candidatesStatus}
            hint={candidatesUnavailable ? "Candidate cache not ready" : undefined}
          />
          {showCoverageKpis ? (
            <>
              <KpiCard
                label="Coverage risk"
                value={insights ? `${insights.fillRiskScore}/100` : "…"}
                hint={insights?.fillRiskLabel}
                loading={kpiLoading && !insights}
              />
              <KpiCard
                label="Critical territories"
                value={insights ? insights.criticalTerritories.toLocaleString() : "…"}
                hint="DM territories below health threshold"
                loading={kpiLoading && !insights}
              />
            </>
          ) : null}
          {assignmentRollups ? (
            <>
              <KpiCard
                label="Auto assignment rate"
                value={`${assignmentRollups.autoAssignmentRate}%`}
                hint="Owned candidates assigned automatically"
              />
              <KpiCard
                label="Manual assignment required"
                value={assignmentRollups.manualAssignmentRequired.toLocaleString()}
                hint="Candidates still unassigned"
              />
              <KpiCard
                label="Assignment confidence"
                value={
                  assignmentRollups.assignmentConfidence > 0
                    ? `${assignmentRollups.assignmentConfidence}%`
                    : "—"
                }
                hint="Average auto-assignment confidence"
              />
              <KpiCard
                label="Overdue recruiter actions"
                value={assignmentRollups.overdueRecruiterActions.toLocaleString()}
                hint="Assigned candidates past action due date"
              />
              <KpiCard
                label="Actions due today"
                value={assignmentRollups.actionsDueToday.toLocaleString()}
                hint="Recruiter actions due today"
              />
              <KpiCard
                label="Average action age"
                value={
                  assignmentRollups.averageActionAgeDays > 0
                    ? `${assignmentRollups.averageActionAgeDays}d`
                    : "—"
                }
                hint="Days since last generated action"
              />
              <KpiCard
                label="Recruiter SLA compliance"
                value={`${assignmentRollups.recruiterSlaCompliance}%`}
                hint="Actions completed on or before due date"
              />
              <KpiCard
                label="Candidates ready to advance"
                value={assignmentRollups.candidatesReadyToAdvance.toLocaleString()}
                hint="Progression engine recommends next stage"
              />
              <KpiCard
                label="Stalled candidates"
                value={assignmentRollups.stalledCandidates.toLocaleString()}
                hint="Escalation or SLA breach detected"
              />
              <KpiCard
                label="Progression SLA compliance"
                value={`${assignmentRollups.progressionSlaCompliance}%`}
                hint="Candidates not stalled in pipeline"
              />
              <KpiCard
                label="Progression bottlenecks"
                value={
                  assignmentRollups.progressionBottlenecks.length > 0
                    ? assignmentRollups.progressionBottlenecks[0]
                    : "—"
                }
                hint={
                  assignmentRollups.progressionBottlenecks.length > 1
                    ? assignmentRollups.progressionBottlenecks.slice(1).join(" · ")
                    : "Top stage concentration"
                }
              />
            </>
          ) : assignmentRollupsLoading ? (
            <>
              <KpiCard label="Overdue recruiter actions" value="…" loading />
              <KpiCard label="Actions due today" value="…" loading />
              <KpiCard label="Average action age" value="…" loading />
              <KpiCard label="Recruiter SLA compliance" value="…" loading />
              <KpiCard label="Candidates ready to advance" value="…" loading />
              <KpiCard label="Stalled candidates" value="…" loading />
              <KpiCard label="Progression SLA compliance" value="…" loading />
            </>
          ) : null}
        </div>
        {assignmentRollupsError ? (
          <div
            role="status"
            className="mt-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          >
            <p>{assignmentRollupsError}</p>
            <button
              type="button"
              onClick={() => recruiting.refresh()}
              className="mt-2 rounded-lg border border-amber-400/40 px-3 py-1 text-xs font-medium hover:bg-amber-500/20"
            >
              Retry recruiting metrics
            </button>
          </div>
        ) : null}
      </section>

      <ExecutiveActionsStrip
        overdueAccountability={overdueCount}
        needsAttention={needsAttentionCount}
        pipelineBottlenecks={pipelineBottleneckCount}
      />

      <AtsHealthCard collapsible />

      <PipelineHealthPanel />

      <div className="grid gap-6 lg:grid-cols-2">
        <TerritoryTable
          title="Top 10 risk territories"
          rows={riskTerritories}
          loading={loading && !data}
          loadingCeilingHit={loadingCeilingHit}
        />
        <TerritoryTable
          title="Top 10 healthy territories"
          rows={healthyTerritories}
          loading={loading && !data}
          loadingCeilingHit={loadingCeilingHit}
        />
      </div>

      <ExecutiveAccountabilitySummary
        openActions={openActions}
        overdueActions={overdueCount}
        headline={accountabilityHeadline}
        loading={accountability.loading && !accountability.snapshot}
        error={accountability.error}
        onRetry={() => accountability.refresh()}
      />
    </div>
  );
}
