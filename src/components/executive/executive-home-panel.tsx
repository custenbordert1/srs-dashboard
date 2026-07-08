"use client";

import { ExecutiveSystemStatusBanner } from "@/components/executive/executive-system-status-banner";
import { AtsHealthCard } from "@/components/executive/ats-health-card";
import { ExecutiveAccountabilitySummary } from "@/components/executive/executive-accountability-summary";
import { ExecutiveActionsStrip } from "@/components/executive/executive-actions-strip";
import { ApplicantCaptureHealthPanel } from "@/components/recruiting/applicant-capture-health-panel";
import { AutomationHealthPanel } from "@/components/executive/automation-health-panel";
import { ExecutionHealthPanel } from "@/components/executive/execution-health-panel";
import { ExecutiveCommandSummaryPanel } from "@/components/executive/executive-command-summary-panel";
import { RecruiterAssignmentPreviewPanel } from "@/components/executive/recruiter-assignment-preview-panel";
import { P62P83ApprovalPreviewPanel } from "@/components/executive/p62-p83-approval-preview-panel";
import { P84SendQueuePreviewPanel } from "@/components/executive/p84-send-queue-preview-panel";
import { ApprovalModeProductionPanel } from "@/components/executive/approval-mode-production-panel";
import { LiveSendReadinessPanel } from "@/components/executive/live-send-readiness-panel";
import { ControlledLiveSendPanel } from "@/components/executive/controlled-live-send-panel";
import { ControlledLivePaperworkPilotPanel } from "@/components/executive/controlled-live-paperwork-pilot-panel";
import { AutonomousPaperworkOrchestratorOperationsPanel } from "@/components/executive/autonomous-paperwork-orchestrator-operations-panel";
import { AutonomousPaperworkEnginePanel } from "@/components/executive/autonomous-paperwork-engine-panel";
import { AutonomousRecoveryCenterPanel } from "@/components/executive/autonomous-recovery-center-panel";
import { AutonomousPaperworkOperationsCenterPanel } from "@/components/executive/autonomous-paperwork-operations-center-panel";
import { ProductionSchedulerPanel } from "@/components/executive/production-scheduler-panel";
import { AutonomousProductionRunnerPanel } from "@/components/executive/autonomous-production-runner-panel";
import { PaperworkMonitorPanel } from "@/components/executive/paperwork-monitor-panel";
import { ProjectMappingPanel } from "@/components/executive/project-mapping-panel";
import { BulkMappingReviewPanel } from "@/components/executive/bulk-mapping-review-panel";
import { ProjectMappingReviewWorkflowPanel } from "@/components/executive/project-mapping-review-workflow-panel";
import { LiveSendOperatorChecklistPanel } from "@/components/executive/live-send-operator-checklist-panel";
import { OnboardingPipelineExecutiveCard } from "@/components/executive/onboarding-pipeline-executive-card";
import { AutonomousOnboardingPanel } from "@/components/executive/autonomous-onboarding-panel";
import { AutonomousPaperworkPanel } from "@/components/executive/autonomous-paperwork-panel";
import { AutonomousPaperworkExecutionPanel } from "@/components/executive/autonomous-paperwork-execution-panel";
import { AutonomousCandidateCommunicationPanel } from "@/components/executive/autonomous-candidate-communication-panel";
import { ExecutiveDailyBriefPanel } from "@/components/executive/executive-daily-brief-panel";
import { AutonomousOperationsCenterPanel } from "@/components/executive/autonomous-operations-center-panel";
import { AutonomousDecisionEnginePanel } from "@/components/executive/autonomous-decision-engine-panel";
import { AICommandCenterPanel } from "@/components/executive/ai-command-center-panel";
import { AutonomousApprovalGovernancePanel } from "@/components/executive/autonomous-approval-governance-panel";
import { AutonomousRecruitingOrchestratorPanel } from "@/components/executive/autonomous-recruiting-orchestrator-panel";
import { ExecutiveNaturalLanguageQueriesPanel } from "@/components/executive/executive-natural-language-queries-panel";
import { WorkforcePlacementPanel } from "@/components/executive/workforce-placement-panel";
import { OnboardingHealthPanel } from "@/components/executive/onboarding-health-panel";
import { RecruiterAutomationReadinessPanel } from "@/components/executive/recruiter-automation-readiness-panel";
import { PipelineHealthPanel } from "@/components/executive/pipeline-health-panel";
import { CandidateAdvancementIntelligencePanel } from "@/components/executive/candidate-advancement-intelligence-panel";
import { AutomationPreviewQueuePanel } from "@/components/executive/automation-preview-queue-panel";
import { ControlledPaperworkAutomationPanel } from "@/components/executive/controlled-paperwork-automation-panel";
import { PaperworkApprovalQueuePanel } from "@/components/executive/paperwork-approval-queue-panel";
import { AutoSendPaperworkReminderPanel } from "@/components/executive/auto-send-paperwork-reminder-panel";
import { InitialPaperworkAutomationPanel } from "@/components/executive/initial-paperwork-automation-panel";
import { AutonomousOperationsPanel } from "@/components/executive/autonomous-operations-panel";
import { ProductionOperationsDashboardPanel } from "@/components/executive/production-operations-dashboard-panel";
import { CandidatePipelineAdvancementPanel } from "@/components/executive/candidate-pipeline-advancement-panel";
import type { ExecutiveDashboardSnapshot, TerritoryRollupRow } from "@/lib/dm-dashboard";
import { buildExecutiveSnapshotContent } from "@/lib/build-executive-home-snapshot";
import { sanitizeFriendlyFetchMessage } from "@/lib/friendly-fetch-errors";
import { useAtsHealth } from "@/hooks/use-ats-health";
import { useTerritoryDashboard } from "@/hooks/use-territory-dashboard";
import { useExecutiveAccountability } from "@/hooks/use-executive-accountability";
import { usePipelineIntelligence } from "@/hooks/use-pipeline-intelligence";
import { useRecruitingIntelligence } from "@/hooks/use-recruiting-intelligence";
import {
  EmptyState,
  ExecutiveHero,
  type ExecutiveBriefingHealth,
  ExecutiveCard,
  CollapsibleSection,
  IconUsers,
  MetricCard,
  type MetricCardStatus,
  SectionHeader,
} from "@/components/executive/ui";
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
    <ExecutiveCard>
      <SectionHeader title={title} />
      {showLoading ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="h-8 animate-pulse rounded bg-zinc-800/80" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Territory rollups pending"
            description="Territory health rankings will appear once dashboard data loads."
          />
        </div>
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
    </ExecutiveCard>
  );
}

export function ExecutiveHomePanel({ userName }: { userName?: string | null }) {
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
  const candidatesStatus: MetricCardStatus = candidatesSyncPending
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

  const territoryRows = data?.territoryRollups ?? [];
  const platformHealth =
    territoryRows.length > 0
      ? Math.round(territoryRows.reduce((sum, row) => sum + row.healthScore, 0) / territoryRows.length)
      : null;
  const recruitingHealth = insights != null ? Math.max(0, 100 - insights.fillRiskScore) : null;
  const operationsHealthLabel = atsFallback?.statusLabel ?? "Monitoring";
  const automationReadiness = assignmentRollups?.autoAssignmentRate ?? null;
  const briefingHealth: ExecutiveBriefingHealth = {
    platformHealth,
    recruitingHealth,
    operationsHealthLabel,
    automationReadiness,
    recruitingLoading: kpiLoading && recruitingHealth == null,
    platformLoading: loading && !data && platformHealth == null,
    operationsLoading: atsHealth.loading && !atsFallback,
    automationLoading: assignmentRollupsLoading,
  };

  return (
    <div className="space-y-12">
      <ExecutiveSystemStatusBanner />

      <ExecutiveHero
        userName={userName}
        snapshot={snapshot}
        health={briefingHealth}
        lastUpdated={formatTimestamp(lastUpdated)}
      />

      <ExecutiveCommandSummaryPanel />

      <AutonomousPaperworkOperationsCenterPanel />

      <ProductionSchedulerPanel />

      <AutonomousRecoveryCenterPanel />

      <CollapsibleSection
        id="advanced-platform-intelligence"
        title="Advanced platform intelligence"
        subtitle="AI command center, orchestration, governance, and recruiting engines"
        defaultOpen={false}
      >
        <div className="space-y-12">
          <AICommandCenterPanel />
          <ApplicantCaptureHealthPanel />
          <AutomationHealthPanel />
          <ExecutionHealthPanel />
          <OnboardingHealthPanel />
          <AutonomousPaperworkPanel />
          <AutonomousPaperworkExecutionPanel />
          <OnboardingPipelineExecutiveCard />
          <AutonomousOnboardingPanel />
          <WorkforcePlacementPanel />
          <ExecutiveDailyBriefPanel />
          <AutonomousCandidateCommunicationPanel />
          <AutonomousRecruitingOrchestratorPanel />
          <AutonomousOperationsCenterPanel />
          <AutonomousDecisionEnginePanel />
          <AutonomousApprovalGovernancePanel />
          <ExecutiveNaturalLanguageQueriesPanel />
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="paperwork-live-send-diagnostics"
        title="Paperwork & live-send diagnostics"
        subtitle="Engine previews, mapping tools, operator checklist, and historical artifacts"
        defaultOpen={false}
      >
        <div className="space-y-12">
          <RecruiterAssignmentPreviewPanel />
          <P62P83ApprovalPreviewPanel />
          <P84SendQueuePreviewPanel />
          <ApprovalModeProductionPanel />
          <LiveSendReadinessPanel />
          <ControlledLiveSendPanel />
          <ControlledLivePaperworkPilotPanel />
          <AutonomousPaperworkOrchestratorOperationsPanel />
          <AutonomousProductionRunnerPanel />
          <AutonomousPaperworkEnginePanel />
          <PaperworkMonitorPanel />
          <ProjectMappingPanel />
          <ProjectMappingReviewWorkflowPanel />
          <BulkMappingReviewPanel />
          <LiveSendOperatorChecklistPanel />
          <RecruiterAutomationReadinessPanel />
        </div>
      </CollapsibleSection>

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

      <ExecutiveCard>
        <SectionHeader title="Executive KPIs" subtitle="Operational metrics across recruiting, coverage, and automation." />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {showOpenJobsKpi ? (
            <MetricCard label="Open jobs" value={openJobs.toLocaleString()} loading={kpiLoading && !jobsAvailable} />
          ) : null}
          <MetricCard
            label="Candidates"
            value={candidatesValue}
            loading={kpiLoading && candidatesStatus === "normal"}
            status={candidatesStatus}
            hint={candidatesUnavailable ? "Candidate cache not ready" : undefined}
          />
          {showCoverageKpis ? (
            <>
              <MetricCard
                label="Coverage risk"
                value={insights ? `${insights.fillRiskScore}/100` : "…"}
                hint={insights?.fillRiskLabel}
                loading={kpiLoading && !insights}
              />
              <MetricCard
                label="Critical territories"
                value={insights ? insights.criticalTerritories.toLocaleString() : "…"}
                hint="DM territories below health threshold"
                loading={kpiLoading && !insights}
              />
            </>
          ) : null}
          {assignmentRollups ? (
            <>
              <MetricCard
                label="Auto assignment rate"
                value={`${assignmentRollups.autoAssignmentRate}%`}
                hint="Owned candidates assigned automatically"
              />
              <MetricCard
                label="Candidates missing owners"
                value={assignmentRollups.manualAssignmentRequired.toLocaleString()}
                hint="Candidates still unassigned"
                icon={<IconUsers size={16} />}
              />
              <MetricCard
                label="Assignment confidence"
                value={
                  assignmentRollups.assignmentConfidence > 0
                    ? `${assignmentRollups.assignmentConfidence}%`
                    : "—"
                }
                hint="Average auto-assignment confidence"
              />
              <MetricCard
                label="Overdue recruiter actions"
                value={assignmentRollups.overdueRecruiterActions.toLocaleString()}
                hint="Assigned candidates past action due date"
              />
              <MetricCard
                label="Actions due today"
                value={assignmentRollups.actionsDueToday.toLocaleString()}
                hint="Recruiter actions due today"
              />
              <MetricCard
                label="Average action age"
                value={
                  assignmentRollups.averageActionAgeDays > 0
                    ? `${assignmentRollups.averageActionAgeDays}d`
                    : "—"
                }
                hint="Days since last generated action"
              />
              <MetricCard
                label="Recruiter SLA compliance"
                value={`${assignmentRollups.recruiterSlaCompliance}%`}
                hint="Actions completed on or before due date"
              />
              <MetricCard
                label="Candidates ready to advance"
                value={assignmentRollups.candidatesReadyToAdvance.toLocaleString()}
                hint="Progression engine recommends next stage"
              />
              <MetricCard
                label="Stalled candidates"
                value={assignmentRollups.stalledCandidates.toLocaleString()}
                hint="Escalation or SLA breach detected"
              />
              <MetricCard
                label="Progression SLA compliance"
                value={`${assignmentRollups.progressionSlaCompliance}%`}
                hint="Candidates not stalled in pipeline"
              />
              <MetricCard
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
              <MetricCard label="Overdue recruiter actions" value="…" loading />
              <MetricCard label="Actions due today" value="…" loading />
              <MetricCard label="Average action age" value="…" loading />
              <MetricCard label="Recruiter SLA compliance" value="…" loading />
              <MetricCard label="Candidates ready to advance" value="…" loading />
              <MetricCard label="Stalled candidates" value="…" loading />
              <MetricCard label="Progression SLA compliance" value="…" loading />
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
      </ExecutiveCard>

      <ExecutiveActionsStrip
        overdueAccountability={overdueCount}
        needsAttention={needsAttentionCount}
        pipelineBottlenecks={pipelineBottleneckCount}
      />

      <AtsHealthCard collapsible />

      <PipelineHealthPanel />

      <CandidateAdvancementIntelligencePanel />

      <AutomationPreviewQueuePanel />

      <ControlledPaperworkAutomationPanel />

      <PaperworkApprovalQueuePanel />

      <AutoSendPaperworkReminderPanel />

      <InitialPaperworkAutomationPanel />

      <AutonomousOperationsPanel />

      <ProductionOperationsDashboardPanel />

      <CandidatePipelineAdvancementPanel />

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
