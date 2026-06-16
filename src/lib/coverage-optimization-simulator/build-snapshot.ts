import { buildAlertSnapshot } from "@/lib/alerts/build-alert-snapshot";
import { mergeAlertStatuses } from "@/lib/alerts/executive-alert-filters";
import type {
  ExecutiveAlertActionLogEntry,
  ExecutiveAlertFollowUp,
  ExecutiveAlertStatusOverlay,
} from "@/lib/alerts/executive-alert-status-types";
import {
  buildExecutiveRecoverySummary,
  buildRawReEngagementOpportunities,
  buildTerritoryRecoveryForecasts,
} from "@/lib/candidate-re-engagement-intelligence";
import { buildDailyActionPlanSnapshot } from "@/lib/executive-daily-action-plan";
import {
  buildBaselineMetrics,
  diffImpactMetrics,
  simulateScenarioImpact,
  type ImpactModelContext,
} from "@/lib/coverage-optimization-simulator/impact-model";
import {
  buildForecastComparison,
  buildOptimizationSuggestions,
  topRoiScenarios,
} from "@/lib/coverage-optimization-simulator/optimization-ranking";
import { resolveCoverageOptimizationSimulatorScope } from "@/lib/coverage-optimization-simulator/permissions";
import { buildRecommendationSimulationTests } from "@/lib/coverage-optimization-simulator/recommendation-testing";
import { buildResourceAllocationSimulations } from "@/lib/coverage-optimization-simulator/resource-allocation";
import { SIMULATOR_SCENARIOS } from "@/lib/coverage-optimization-simulator/scenarios";
import {
  buildTerritorySimulatorOptions,
  filterTerritoryRowsForScope,
  findTerritoryRow,
  territoryScaleForRow,
} from "@/lib/coverage-optimization-simulator/territory-scope";
import type {
  CoverageImpactComparison,
  CoverageOptimizationSimulatorSnapshot,
  SimulatorScenarioKind,
  SimulatorScenarioResult,
} from "@/lib/coverage-optimization-simulator/types";
import { buildPredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk";
import { buildRecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot";
import { filterAlertsForDmScope, filterFollowUpsForDmScope } from "@/lib/dm-operating-system/filter-territory-scope";
import {
  filterAlertsForRecruiterScope,
  filterFollowUpsForRecruiterScope,
} from "@/lib/recruiter-operating-system/filter-recruiter-scope";
import { resolveRecruiterOperatingSystemScope } from "@/lib/recruiter-operating-system/permissions";
import { buildUnifiedRecruitingCommandCenterSnapshot } from "@/lib/unified-recruiting-command-center";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import type { AuthSession } from "@/lib/auth/types";
import { isDmRole, isRecruiterRole } from "@/lib/auth/roles";
import { resolveDmOperatingSystemScope } from "@/lib/dm-operating-system/permissions";

export type BuildCoverageOptimizationSimulatorInput = {
  session: AuthSession;
  bundle: RecruitingIntelligenceRouteBundle;
  followUps?: ExecutiveAlertFollowUp[];
  statusOverlays?: ExecutiveAlertStatusOverlay[];
  actionLogs?: ExecutiveAlertActionLogEntry[];
  requestedRecruiter?: string | null;
  requestedTerritoryId?: string | null;
  requestedScenarioKind?: SimulatorScenarioKind | null;
  referenceMs?: number;
};

function buildImpactContext(input: {
  bundle: RecruitingIntelligenceRouteBundle;
  commandCenterCoverage: number;
  commandCenterOpenCalls: number;
  commandCenterPredictedGap: number;
  riskCritical: number;
  recoverableCandidates: number;
  potentialPlacements: number;
  reEngagementCoverageGain: number;
  pipelineDepth: number;
  hiringVelocity: number;
}): ImpactModelContext {
  return {
    openCalls: input.commandCenterOpenCalls,
    coveragePercent: input.commandCenterCoverage,
    predictedCoverageGap: input.commandCenterPredictedGap,
    criticalTerritories: input.riskCritical,
    recoverableCandidates: input.recoverableCandidates,
    potentialPlacements: input.potentialPlacements,
    reEngagementCoverageGain: input.reEngagementCoverageGain,
    pipelineDepth: input.pipelineDepth,
    hiringVelocity: input.hiringVelocity,
  };
}

function buildScenarioResult(input: {
  kind: SimulatorScenarioKind;
  ctx: ImpactModelContext;
  territoryRow?: ReturnType<typeof findTerritoryRow>;
  confidenceScore?: number;
}): SimulatorScenarioResult {
  const definition = SIMULATOR_SCENARIOS.find((row) => row.kind === input.kind)!;
  const baseline = buildBaselineMetrics(input.ctx);
  const simulated = simulateScenarioImpact({
    kind: input.kind,
    ctx: input.ctx,
    confidenceScore: input.confidenceScore,
    territoryScale: territoryScaleForRow(input.territoryRow),
  });

  const impact: CoverageImpactComparison = {
    current: baseline,
    projected: simulated.projected,
    difference: diffImpactMetrics(simulated.projected, baseline),
  };

  return {
    id: `scenario-${input.kind}${input.territoryRow ? `-${input.territoryRow.entityId}` : ""}`,
    kind: input.kind,
    label: definition.label,
    territoryId: input.territoryRow?.entityId,
    territoryLabel: input.territoryRow?.label,
    dmName: input.territoryRow?.dmName,
    impact,
    expectedRoiScore: simulated.expectedRoiScore,
    confidenceScore: simulated.confidenceScore,
    confidenceLow: simulated.confidenceLow,
    confidenceHigh: simulated.confidenceHigh,
    reasoning: definition.description,
  };
}

export function buildCoverageOptimizationSimulatorSnapshot(
  input: BuildCoverageOptimizationSimulatorInput,
): CoverageOptimizationSimulatorSnapshot {
  const { session, bundle } = input;
  const referenceMs = input.referenceMs ?? Date.parse(bundle.fetchedAt);
  const followUps = input.followUps ?? [];
  const statusOverlays = input.statusOverlays ?? [];
  const actionLogs = input.actionLogs ?? [];
  const scope = resolveCoverageOptimizationSimulatorScope(session, input.requestedRecruiter);

  const alertSnapshot = buildAlertSnapshot({ bundle });
  const alerts = mergeAlertStatuses(alertSnapshot.alerts, statusOverlays);

  const scopedAlerts = (() => {
    if (isDmRole(session.role)) {
      const dmScope = resolveDmOperatingSystemScope(session);
      return filterAlertsForDmScope(alerts, dmScope);
    }
    if (isRecruiterRole(session.role)) {
      const recruiterScope = resolveRecruiterOperatingSystemScope(session, input.requestedRecruiter);
      return filterAlertsForRecruiterScope(alerts, recruiterScope);
    }
    return alerts;
  })();

  const scopedFollowUps = (() => {
    if (isDmRole(session.role)) {
      const dmScope = resolveDmOperatingSystemScope(session);
      return filterFollowUpsForDmScope(followUps, dmScope);
    }
    if (isRecruiterRole(session.role)) {
      const recruiterScope = resolveRecruiterOperatingSystemScope(session, input.requestedRecruiter);
      return filterFollowUpsForRecruiterScope(followUps, recruiterScope);
    }
    return followUps;
  })();

  const riskSnapshot = buildPredictiveTerritoryRiskSnapshot({
    bundle,
    alerts: scopedAlerts,
    followUps: scopedFollowUps,
    referenceMs,
  });
  const autopilot = buildRecruitingAutopilotSnapshot({
    bundle,
    alerts: scopedAlerts,
    followUps: scopedFollowUps,
  });
  const dailyActionPlan = buildDailyActionPlanSnapshot({
    bundle,
    alerts: scopedAlerts,
    followUps: scopedFollowUps,
    statusOverlays,
    referenceMs,
  });
  const commandCenter = buildUnifiedRecruitingCommandCenterSnapshot({
    bundle,
    followUps: scopedFollowUps,
    statusOverlays,
    actionLogs,
    referenceMs,
  });

  const recruiterScope = resolveRecruiterOperatingSystemScope(session, input.requestedRecruiter);
  const rawReEngagement = buildRawReEngagementOpportunities({
    bundle,
    scope: recruiterScope,
    referenceMs,
  });
  const reEngagementForecasts = buildTerritoryRecoveryForecasts({
    bundle,
    opportunities: rawReEngagement,
  });
  const reEngagementSummary = buildExecutiveRecoverySummary({
    opportunities: rawReEngagement,
    forecasts: reEngagementForecasts,
  });

  const scopedTerritoryRows = filterTerritoryRowsForScope(riskSnapshot.territories, scope);
  const selectedTerritory = findTerritoryRow(
    scopedTerritoryRows,
    input.requestedTerritoryId ?? scopedTerritoryRows[0]?.entityId,
  );

  const pipelineDepth = bundle.candidates.length;
  const ctx = buildImpactContext({
    bundle,
    commandCenterCoverage: commandCenter.kpis.coveragePercent,
    commandCenterOpenCalls: commandCenter.kpis.openCalls,
    commandCenterPredictedGap: commandCenter.kpis.predictedCoverageGap,
    riskCritical: riskSnapshot.executiveSummary.totalCriticalTerritories,
    recoverableCandidates: reEngagementSummary.recoverableCandidates,
    potentialPlacements: reEngagementSummary.potentialPlacements,
    reEngagementCoverageGain: reEngagementSummary.estimatedCoverageGainPercent,
    pipelineDepth,
    hiringVelocity: commandCenter.kpis.hiringVelocity,
  });

  const baseline = buildBaselineMetrics(ctx);
  const scenarioKinds = input.requestedScenarioKind
    ? [input.requestedScenarioKind]
    : SIMULATOR_SCENARIOS.map((row) => row.kind);

  const scenarios: SimulatorScenarioResult[] = scenarioKinds.map((kind) => {
    const matchingRec = autopilot.all.find(
      (rec) =>
        SIMULATOR_SCENARIOS.find((s) => s.kind === kind)?.autopilotKinds.includes(rec.kind),
    );
    return buildScenarioResult({
      kind,
      ctx,
      territoryRow: selectedTerritory,
      confidenceScore: matchingRec?.confidenceScore,
    });
  });

  const ranked = topRoiScenarios(scenarios);
  const topRanked = topRoiScenarios(scenarios, 10);
  const recommendationTests = buildRecommendationSimulationTests({
    recommendations: autopilot.all,
    ctx,
    territoryRows: scopedTerritoryRows,
  });
  const resourceAllocations = buildResourceAllocationSimulations(ctx);

  const bestScenario = ranked[0];
  const optimized = bestScenario
    ? bestScenario.impact.projected
    : {
        ...baseline,
        additionalCandidates: autopilot.executiveSummary.expectedAdditionalCandidates,
        additionalHires: autopilot.executiveSummary.expectedAdditionalHires,
        coveragePercent: baseline.coveragePercent + autopilot.executiveSummary.expectedAdditionalStoreCoverage,
        openCallsReduced: Math.round(commandCenter.kpis.openCalls * 0.08),
        riskReduction: autopilot.executiveSummary.expectedRiskReduction,
      };

  const forecastComparison = buildForecastComparison({
    baseline,
    optimized,
  });

  const activeScenarioId = input.requestedScenarioKind
    ? scenarios.find((row) => row.kind === input.requestedScenarioKind)?.id ?? null
    : bestScenario?.id ?? null;

  return {
    generatedAt: bundle.fetchedAt,
    planDate: dailyActionPlan.planDate,
    scope,
    baseline,
    scenarios,
    topRoiScenarios: topRanked,
    recommendationTests,
    resourceAllocations,
    optimizationSuggestions: buildOptimizationSuggestions(ranked),
    forecastComparison,
    territoryOptions: buildTerritorySimulatorOptions(riskSnapshot.territories, scope),
    activeScenarioId,
  };
}
