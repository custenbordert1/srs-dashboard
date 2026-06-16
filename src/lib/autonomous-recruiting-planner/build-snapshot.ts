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
import { buildExecutiveStrategyView } from "@/lib/autonomous-recruiting-planner/executive-strategy";
import { buildGoalPlanningResult } from "@/lib/autonomous-recruiting-planner/goal-planning";
import { buildRecruitingPlans } from "@/lib/autonomous-recruiting-planner/planning-engine";
import { buildProjectPlanOutlooks } from "@/lib/autonomous-recruiting-planner/project-planning";
import { resolveAutonomousRecruitingPlannerScope } from "@/lib/autonomous-recruiting-planner/permissions";
import { buildRecruiterWorkPlans } from "@/lib/autonomous-recruiting-planner/recruiter-work-plans";
import { buildResourceAllocationRecommendations } from "@/lib/autonomous-recruiting-planner/resource-allocation";
import { buildRiskConstraintSummary } from "@/lib/autonomous-recruiting-planner/risk-constraints";
import { buildTerritoryActionPlans } from "@/lib/autonomous-recruiting-planner/territory-action-plans";
import type {
  AutonomousRecruitingPlannerSnapshot,
  PlannerGoalParams,
} from "@/lib/autonomous-recruiting-planner/types";
import { filterAlertsForDmScope, filterFollowUpsForDmScope } from "@/lib/dm-operating-system/filter-territory-scope";
import { resolveDmOperatingSystemScope } from "@/lib/dm-operating-system/permissions";
import { buildDailyActionPlanSnapshot } from "@/lib/executive-daily-action-plan";
import { buildPredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk";
import { buildRecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot";
import {
  filterAlertsForRecruiterScope,
  filterFollowUpsForRecruiterScope,
} from "@/lib/recruiter-operating-system/filter-recruiter-scope";
import { resolveRecruiterOperatingSystemScope } from "@/lib/recruiter-operating-system/permissions";
import { buildUnifiedRecruitingCommandCenterSnapshot } from "@/lib/unified-recruiting-command-center";
import { buildWorkforceCapacityForecastSnapshot } from "@/lib/workforce-capacity-forecast";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import type { AuthSession } from "@/lib/auth/types";
import { isDmRole, isRecruiterRole } from "@/lib/auth/roles";

export type BuildAutonomousRecruitingPlannerInput = {
  session: AuthSession;
  bundle: RecruitingIntelligenceRouteBundle;
  followUps?: ExecutiveAlertFollowUp[];
  statusOverlays?: ExecutiveAlertStatusOverlay[];
  actionLogs?: ExecutiveAlertActionLogEntry[];
  requestedRecruiter?: string | null;
  goalParams?: PlannerGoalParams;
  referenceMs?: number;
};

export function buildAutonomousRecruitingPlannerSnapshot(
  input: BuildAutonomousRecruitingPlannerInput,
): AutonomousRecruitingPlannerSnapshot {
  const { session, bundle } = input;
  const referenceMs = input.referenceMs ?? Date.parse(bundle.fetchedAt);
  const followUps = input.followUps ?? [];
  const statusOverlays = input.statusOverlays ?? [];
  const actionLogs = input.actionLogs ?? [];
  const scope = resolveAutonomousRecruitingPlannerScope(session, input.requestedRecruiter);

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
  const workforce = buildWorkforceCapacityForecastSnapshot({
    session,
    bundle,
    followUps: scopedFollowUps,
    statusOverlays,
    actionLogs,
    requestedRecruiter: input.requestedRecruiter,
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
  const plans = buildRecruitingPlans({
    commandCenter,
    workforce,
    autopilot,
    recoverableCandidates: reEngagementSummary.recoverableCandidates,
    pipelineDepth,
  });

  const executiveStrategy = buildExecutiveStrategyView(plans);
  const goalPlanning = buildGoalPlanningResult({
    commandCenter,
    autopilot,
    bestPlan: executiveStrategy.bestPlan,
    goalParams: input.goalParams,
  });

  const recruiterFilter = scope.scopedToRecruiter ? scope.recruiterName : input.requestedRecruiter;

  return {
    generatedAt: bundle.fetchedAt,
    planDate: dailyActionPlan.planDate,
    scope,
    plans,
    resourceAllocation: buildResourceAllocationRecommendations({
      workforce,
      autopilot,
      reEngagementSummary,
    }),
    projectOutlooks: buildProjectPlanOutlooks({ bundle, riskSnapshot, workforce }),
    territoryActionPlans: buildTerritoryActionPlans({
      riskSnapshot,
      autopilot,
      territoryStates: scope.territoryStates.length > 0 ? scope.territoryStates : undefined,
    }),
    recruiterWorkPlans: buildRecruiterWorkPlans({
      bundle,
      workforce,
      dailyActionPlan,
      followUps: scopedFollowUps,
      recruiterFilter,
      referenceMs,
    }),
    executiveStrategy,
    goalPlanning,
    riskConstraints: buildRiskConstraintSummary({
      workforce,
      riskSnapshot,
      autopilot,
      recoverableCandidates: reEngagementSummary.recoverableCandidates,
    }),
  };
}
