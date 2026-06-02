import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";
import { countNeedsAttentionAlerts } from "@/lib/dm-dashboard/territory-alert-pipeline";
import {
  DISTRICT_MANAGERS,
  getAssignedStatesForDm,
  type DistrictManager,
} from "@/lib/dm-territory-map";
import { resolveCoverageHealthTier } from "@/lib/territory-intelligence/coverage-tier";
import {
  aggregateActiveRepsByState,
  buildTerritoryHealth,
  countActiveRepsForDm,
  countActiveRepsFromOnboardingFallback,
  countApplicantsLast7Days,
  countHiredFromCandidates,
  countOpenCallsForDm,
  countOpenCallsFromDemandSignals,
  countReadyForMel,
  countWorkflowPaperworkSent,
  filterCandidatesByStates,
  filterJobsByStates,
} from "@/lib/territory-intelligence/metric-calculators";
import type {
  RecruitingPipelineMetrics,
  TerritoryDemandSignals,
  TerritoryMetrics,
  TerritoryOnboardingSignals,
  TerritoryRollupRow,
} from "@/lib/territory-intelligence/types";

export type TerritoryIntelligenceContext = {
  jobs: BreezyJob[];
  candidates: BreezyCandidate[];
  fetchedAt: string;
  coverage: CoverageRiskSnapshot | null;
  workflows: CandidateWorkflowState | null;
};

export function buildAttentionScore(metrics: TerritoryMetrics): number {
  const coverageGap = Math.max(0, 100 - metrics.coveragePercent);
  return coverageGap + metrics.openCalls * 2 + Math.max(0, 5 - metrics.activeReps) * 3;
}

export function buildTerritoryMetricsForStates(
  states: string[],
  ctx: TerritoryIntelligenceContext,
  options?: {
    dmName?: DistrictManager;
    demandSignals?: TerritoryDemandSignals;
    onboarding?: TerritoryOnboardingSignals;
    melMatchCount?: number;
  },
): TerritoryMetrics {
  const dmJobs = filterJobsByStates(ctx.jobs, states);
  const dmCandidates = filterCandidatesByStates(ctx.candidates, states);
  const territoryHealth = buildTerritoryHealth(dmJobs, dmCandidates, ctx.fetchedAt);
  const coveragePercent = territoryHealth.score;
  const activeRepsByState = aggregateActiveRepsByState(ctx.coverage);

  const openCalls =
    options?.dmName && ctx.coverage
      ? countOpenCallsForDm(options.dmName, ctx.coverage)
      : options?.demandSignals
        ? countOpenCallsFromDemandSignals(options.demandSignals)
        : options?.dmName
          ? countOpenCallsForDm(options.dmName, ctx.coverage)
          : 0;

  const activeReps =
    ctx.coverage && options?.dmName
      ? countActiveRepsForDm(options.dmName, activeRepsByState)
      : options?.onboarding
        ? countActiveRepsFromOnboardingFallback(options.onboarding)
        : 0;

  const scopedWorkflows = scopeWorkflowsToStates(ctx.workflows, dmCandidates);
  const ddApproved = options?.onboarding?.ddApproved ?? 0;

  return {
    coveragePercent,
    coverageTier: resolveCoverageHealthTier(coveragePercent),
    territoryHealth,
    activeReps,
    openCalls,
    openJobs: dmJobs.length,
    applicantsLast7Days: countApplicantsLast7Days(dmCandidates, ctx.fetchedAt),
    hired: options?.onboarding?.hired ?? countHiredFromCandidates(dmCandidates),
    paperworkSent:
      options?.onboarding?.paperworkSent ??
      countWorkflowPaperworkSent(scopedWorkflows),
    readyForMel: countReadyForMel({
      workflows: scopedWorkflows,
      ddApproved,
      melMatchCount: options?.melMatchCount ?? 0,
    }),
  };
}

function scopeWorkflowsToStates(
  workflows: CandidateWorkflowState | null,
  candidates: BreezyCandidate[],
): CandidateWorkflowState | null {
  if (!workflows) return null;
  const allowed = new Set(candidates.map((candidate) => candidate.candidateId));
  const scoped: CandidateWorkflowState = {};
  for (const [candidateId, workflow] of Object.entries(workflows)) {
    if (allowed.has(candidateId)) {
      scoped[candidateId] = workflow;
    }
  }
  return scoped;
}

export function buildTerritoryMetricsFromDashboardSnapshot(
  snapshot: DmDashboardSnapshot,
): TerritoryMetrics {
  const demandSignals: TerritoryDemandSignals = {
    shortageSum: snapshot.coverage.candidateShortagesByState.reduce((sum, bar) => sum + bar.value, 0),
    unstaffedMelCount: snapshot.melMatching.unstaffedHighPriorityStores.length,
  };

  const onboarding: TerritoryOnboardingSignals = {
    paperworkSent: snapshot.onboarding.paperworkSent,
    paperworkSigned: snapshot.onboarding.paperworkSigned,
    ddApproved: snapshot.onboarding.ddApproved,
    hired: snapshot.pipeline.counts.hired,
  };

  return {
    coveragePercent: snapshot.health.score,
    coverageTier: resolveCoverageHealthTier(snapshot.health.score),
    territoryHealth: snapshot.health,
    activeReps: countActiveRepsFromOnboardingFallback(onboarding),
    openCalls: countOpenCallsFromDemandSignals(demandSignals),
    openJobs: snapshot.activeJobs,
    applicantsLast7Days: snapshot.candidatesLast7Days,
    hired: onboarding.hired,
    paperworkSent: onboarding.paperworkSent,
    readyForMel: countReadyForMel({
      workflows: null,
      ddApproved: onboarding.ddApproved,
      melMatchCount: snapshot.melMatching.bestCandidateForOpenProjects.length,
    }),
  };
}

export function buildRecruitingPipelineMetrics(
  ctx: TerritoryIntelligenceContext,
  overrides?: {
    applicantsLast7Days?: number;
    hired?: number;
    territoryStates?: string[];
  },
): RecruitingPipelineMetrics {
  const states = overrides?.territoryStates;
  const candidates = states ? filterCandidatesByStates(ctx.candidates, states) : ctx.candidates;
  const workflows = states ? scopeWorkflowsToStates(ctx.workflows, candidates) : ctx.workflows;

  return {
    applicantsLast7Days: countApplicantsLast7Days(
      candidates,
      ctx.fetchedAt,
      overrides?.applicantsLast7Days,
    ),
    paperworkSent: countWorkflowPaperworkSent(workflows),
    readyForMel: countReadyForMel({ workflows }),
    hired: overrides?.hired ?? countHiredFromCandidates(candidates),
  };
}

export function buildRecruitingPipelineFromDashboardSnapshot(
  snapshot: DmDashboardSnapshot,
): RecruitingPipelineMetrics {
  const metrics = buildTerritoryMetricsFromDashboardSnapshot(snapshot);
  return {
    applicantsLast7Days: metrics.applicantsLast7Days,
    paperworkSent: metrics.paperworkSent,
    readyForMel: metrics.readyForMel,
    hired: metrics.hired,
  };
}

export function buildDmTerritoryRollups(ctx: TerritoryIntelligenceContext): TerritoryRollupRow[] {
  const activeRepsByState = aggregateActiveRepsByState(ctx.coverage);

  return DISTRICT_MANAGERS.map((dmName) => {
    const states = getAssignedStatesForDm(dmName);
    const dmJobs = filterJobsByStates(ctx.jobs, states);
    const dmCandidates = filterCandidatesByStates(ctx.candidates, states);
    const territoryHealth = buildTerritoryHealth(dmJobs, dmCandidates, ctx.fetchedAt);
    const coveragePercent = territoryHealth.score;

    const metrics: TerritoryMetrics = {
      coveragePercent,
      coverageTier: resolveCoverageHealthTier(coveragePercent),
      territoryHealth,
      openJobs: dmJobs.length,
      openCalls: countOpenCallsForDm(dmName, ctx.coverage),
      activeReps: countActiveRepsForDm(dmName, activeRepsByState),
      applicantsLast7Days: countApplicantsLast7Days(dmCandidates, ctx.fetchedAt),
      hired: countHiredFromCandidates(dmCandidates),
      paperworkSent: countWorkflowPaperworkSent(scopeWorkflowsToStates(ctx.workflows, dmCandidates)),
      readyForMel: countReadyForMel({
        workflows: scopeWorkflowsToStates(ctx.workflows, dmCandidates),
      }),
    };

    return {
      dmName,
      states,
      metrics,
      attentionScore: buildAttentionScore(metrics),
    };
  });
}

export function topTerritoriesNeedingAttention(
  rollups: TerritoryRollupRow[],
  limit = 5,
): TerritoryRollupRow[] {
  return [...rollups]
    .sort((a, b) => b.attentionScore - a.attentionScore || a.dmName.localeCompare(b.dmName))
    .slice(0, limit);
}

export function countNeedsAttentionFromAlertSummary(snapshot: DmDashboardSnapshot): number {
  return countNeedsAttentionAlerts(snapshot.alertSummary);
}
