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
import type { ImpactModelContext } from "@/lib/coverage-optimization-simulator/impact-model";
import { filterAlertsForDmScope, filterFollowUpsForDmScope } from "@/lib/dm-operating-system/filter-territory-scope";
import { resolveDmOperatingSystemScope } from "@/lib/dm-operating-system/permissions";
import {
  filterAlertsForRecruiterScope,
  filterFollowUpsForRecruiterScope,
} from "@/lib/recruiter-operating-system/filter-recruiter-scope";
import { resolveRecruiterOperatingSystemScope } from "@/lib/recruiter-operating-system/permissions";
import { buildPredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk";
import { buildRecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot";
import { buildUnifiedRecruitingCommandCenterSnapshot } from "@/lib/unified-recruiting-command-center";
import { buildCapacityPlanningDashboard } from "@/lib/workforce-capacity-forecast/capacity-planning";
import {
  buildCoverageForecastRows,
  filterCoverageForecastsByStates,
} from "@/lib/workforce-capacity-forecast/coverage-forecast";
import { buildDmCapacityRows } from "@/lib/workforce-capacity-forecast/dm-capacity";
import { buildExecutivePlanningOutlook } from "@/lib/workforce-capacity-forecast/executive-planning";
import { buildHiringForecastPoints } from "@/lib/workforce-capacity-forecast/hiring-forecast";
import { resolveWorkforceCapacityForecastScope } from "@/lib/workforce-capacity-forecast/permissions";
import { buildRecruiterCapacityRows } from "@/lib/workforce-capacity-forecast/recruiter-capacity";
import { buildResourceBalancingRecommendations } from "@/lib/workforce-capacity-forecast/resource-balancing";
import { buildStaffingRiskAreas } from "@/lib/workforce-capacity-forecast/staffing-risk";
import type { WorkforceCapacityForecastSnapshot } from "@/lib/workforce-capacity-forecast/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import type { AuthSession } from "@/lib/auth/types";
import { isDmRole, isRecruiterRole } from "@/lib/auth/roles";

export type BuildWorkforceCapacityForecastInput = {
  session: AuthSession;
  bundle: RecruitingIntelligenceRouteBundle;
  followUps?: ExecutiveAlertFollowUp[];
  statusOverlays?: ExecutiveAlertStatusOverlay[];
  actionLogs?: ExecutiveAlertActionLogEntry[];
  requestedRecruiter?: string | null;
  referenceMs?: number;
  deferExpensive?: boolean;
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

export function buildWorkforceCapacityForecastSnapshot(
  input: BuildWorkforceCapacityForecastInput,
): WorkforceCapacityForecastSnapshot {
  const { session, bundle } = input;
  const referenceMs = input.referenceMs ?? Date.parse(bundle.fetchedAt);
  const followUps = input.followUps ?? [];
  const statusOverlays = input.statusOverlays ?? [];
  const actionLogs = input.actionLogs ?? [];
  const scope = resolveWorkforceCapacityForecastScope(session, input.requestedRecruiter);

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
  buildRecruitingAutopilotSnapshot({
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

  const pipelineDepth = bundle.candidates.length;
  const impactCtx = buildImpactContext({
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

  const recruiterFilter = scope.scopedToRecruiter ? scope.recruiterName : input.requestedRecruiter;
  const dmFilter = scope.scopedToTerritory ? scope.dmName : null;

  const recruiterCapacity = buildRecruiterCapacityRows({
    bundle,
    referenceMs,
    recruiterFilter,
  });

  const dmCapacity = buildDmCapacityRows({
    bundle,
    riskSnapshot,
    followUps: scopedFollowUps,
    alerts: scopedAlerts,
    referenceMs,
    dmFilter,
  });

  const hiringForecast = buildHiringForecastPoints({
    bundle,
    hiringVelocity: commandCenter.kpis.hiringVelocity,
    pipelineDepth,
  });

  const coverageForecasts = filterCoverageForecastsByStates(
    buildCoverageForecastRows({ bundle, riskSnapshot }),
    scope.territoryStates,
  );

  const staffingRisks = buildStaffingRiskAreas({
    recruiterCapacity,
    dmCapacity,
    coverageForecasts,
    riskSnapshot,
  });

  const resourceBalancing = buildResourceBalancingRecommendations({
    ctx: impactCtx,
    recruiterCapacity,
    dmCapacity,
  });

  const capacityPlanning = buildCapacityPlanningDashboard({
    recruiterCapacity,
    dmCapacity,
    bundle,
    riskSnapshot,
  });

  const executiveOutlook = buildExecutivePlanningOutlook({
    hiringForecast,
    recruiterCapacity,
    dmCapacity,
    staffingRisks,
    resourceBalancing,
  });

  return {
    generatedAt: bundle.fetchedAt,
    planDate: dailyActionPlan.planDate,
    scope,
    recruiterCapacity,
    dmCapacity,
    hiringForecast,
    coverageForecasts,
    staffingRisks,
    capacityPlanning,
    resourceBalancing,
    executiveOutlook,
  };
}
