import { buildAlertSnapshot } from "@/lib/alerts/build-alert-snapshot";
import { mergeAlertStatuses } from "@/lib/alerts/executive-alert-filters";
import type {
  ExecutiveAlertActionLogEntry,
  ExecutiveAlertFollowUp,
  ExecutiveAlertStatusOverlay,
} from "@/lib/alerts/executive-alert-status-types";
import {
  buildExecutiveRecoverySummary,
  buildTerritoryRecoveryForecasts,
} from "@/lib/candidate-re-engagement-intelligence/forecasts";
import {
  buildRawReEngagementOpportunities,
  candidateDisplayName,
  defaultRecommendedAction,
} from "@/lib/candidate-re-engagement-intelligence/opportunity-engine";
import {
  buildOutreachRecommendationsForRow,
  resolveExpectedOutcome,
  resolveRecommendedTiming,
} from "@/lib/candidate-re-engagement-intelligence/outreach-recommendations";
import { rankReEngagementOpportunities, scoreOpportunityRanking } from "@/lib/candidate-re-engagement-intelligence/ranking";
import { countBySegment, segmentReEngagementCandidate } from "@/lib/candidate-re-engagement-intelligence/segmentation";
import type {
  CandidateReEngagementIntelligenceSnapshot,
  CandidateReEngagementScope,
  ReEngagementOpportunity,
} from "@/lib/candidate-re-engagement-intelligence/types";
import { mergeReEngagementWorkflowState } from "@/lib/candidate-re-engagement-intelligence/workflow-helpers";
import { buildDailyActionPlanSnapshot } from "@/lib/executive-daily-action-plan";
import { buildPredictiveTerritoryRiskSnapshot } from "@/lib/predictive-territory-risk";
import { buildRecruitingAutopilotSnapshot } from "@/lib/recruiting-autopilot";
import { resolveRecruiterOperatingSystemScope } from "@/lib/recruiter-operating-system/permissions";
import {
  filterAlertsForRecruiterScope,
  filterFollowUpsForRecruiterScope,
} from "@/lib/recruiter-operating-system/filter-recruiter-scope";
import type { RecruiterOperatingSystemScope } from "@/lib/recruiter-operating-system/types";
import type { RecruitingIntelligenceRouteBundle } from "@/lib/recruiting-intelligence/load-recruiting-intelligence-route-bundle";
import type { AuthSession } from "@/lib/auth/types";

export type BuildCandidateReEngagementIntelligenceInput = {
  session: AuthSession;
  bundle: RecruitingIntelligenceRouteBundle;
  followUps?: ExecutiveAlertFollowUp[];
  statusOverlays?: ExecutiveAlertStatusOverlay[];
  actionLogs?: ExecutiveAlertActionLogEntry[];
  requestedRecruiter?: string | null;
  referenceMs?: number;
};

function toScope(scope: RecruiterOperatingSystemScope): CandidateReEngagementScope {
  return {
    recruiterName: scope.recruiterName,
    recruiterLabel: scope.recruiterLabel,
    territoryStates: scope.territoryStates,
    role: scope.role,
    scopedToRecruiter: scope.scopedToRecruiter,
  };
}

function toOpportunity(
  raw: ReturnType<typeof buildRawReEngagementOpportunities>[number] & { rankingScore: number },
  input: {
    statusOverlays: ExecutiveAlertStatusOverlay[];
    followUps: ExecutiveAlertFollowUp[];
  },
): ReEngagementOpportunity {
  const segment = segmentReEngagementCandidate({
    source: raw.source,
    reEngagementScore: raw.reEngagementScore,
    placementProbability: raw.placementProbability,
    matchPercent: raw.row.matchPercent ?? 0,
  });
  const outreach = buildOutreachRecommendationsForRow(raw.row, {
    segment,
    source: raw.source,
    reEngagementScore: raw.reEngagementScore,
    placementProbability: raw.placementProbability,
    territoryImpact: raw.territoryImpact,
  });
  const workflow = mergeReEngagementWorkflowState({
    candidateId: raw.row.candidateId,
    statusOverlays: input.statusOverlays,
    followUps: input.followUps,
  });

  return {
    candidateId: raw.row.candidateId,
    candidateName: candidateDisplayName(raw.row),
    source: raw.source,
    segment,
    reEngagementScore: raw.reEngagementScore,
    placementProbability: raw.placementProbability,
    territoryImpact: raw.territoryImpact,
    projectImpact: raw.projectImpact,
    rankingScore: raw.rankingScore,
    territory: raw.row.state,
    state: raw.row.state,
    city: raw.row.city,
    projectName: raw.projectName,
    storeName: raw.storeName,
    assignedRecruiter: raw.row.assignedRecruiter,
    lastTouchAt: raw.row.lastActionAt,
    appliedDate: raw.row.appliedDate,
    recommendedAction: defaultRecommendedAction(raw.source),
    recommendedTiming: resolveRecommendedTiming(segment),
    expectedOutcome: resolveExpectedOutcome({
      segment,
      placementProbability: raw.placementProbability,
      projectName: raw.projectName,
    }),
    outreach,
    workflowStatus: workflow.workflowStatus,
    workflowAlertId: workflow.workflowAlertId,
    followUpDueAt: workflow.followUpDueAt,
  };
}

export function buildCandidateReEngagementIntelligenceSnapshot(
  input: BuildCandidateReEngagementIntelligenceInput,
): CandidateReEngagementIntelligenceSnapshot {
  const { session, bundle } = input;
  const referenceMs = input.referenceMs ?? Date.parse(bundle.fetchedAt);
  const followUps = input.followUps ?? [];
  const statusOverlays = input.statusOverlays ?? [];
  const scope = resolveRecruiterOperatingSystemScope(session, input.requestedRecruiter);

  const alertSnapshot = buildAlertSnapshot({ bundle });
  const alerts = mergeAlertStatuses(alertSnapshot.alerts, statusOverlays);
  const scopedAlerts = filterAlertsForRecruiterScope(alerts, scope);
  const scopedFollowUps = filterFollowUpsForRecruiterScope(followUps, scope);

  buildPredictiveTerritoryRiskSnapshot({
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

  const rawOpportunities = buildRawReEngagementOpportunities({
    bundle,
    scope,
    referenceMs,
  });

  const ranked = rankReEngagementOpportunities(
    rawOpportunities.map((raw) => ({
      ...raw,
      rankingScore: scoreOpportunityRanking(raw, bundle),
    })),
  );

  const opportunities = ranked.map((raw) =>
    toOpportunity(raw, { statusOverlays, followUps: scopedFollowUps }),
  );

  const territoryForecasts = buildTerritoryRecoveryForecasts({
    bundle,
    opportunities: rawOpportunities,
  });

  const executiveSummary = buildExecutiveRecoverySummary({
    opportunities: rawOpportunities,
    forecasts: territoryForecasts,
  });

  const uniqueOutreach = new Map(
    opportunities.map((row) => [row.outreach.kind, row.outreach]),
  );

  return {
    generatedAt: bundle.fetchedAt,
    planDate: dailyActionPlan.planDate,
    scope: toScope(scope),
    executiveSummary: {
      recoverableCandidates: executiveSummary.recoverableCandidates,
      potentialPlacements: executiveSummary.potentialPlacements,
      estimatedCoverageGainPercent: executiveSummary.estimatedCoverageGainPercent,
      topRecoveryTerritories: executiveSummary.topRecoveryTerritories,
    },
    top25: opportunities.slice(0, 25),
    top100: opportunities.slice(0, 100),
    territoryForecasts,
    segmentCounts: countBySegment(opportunities.map((row) => row.segment)),
    outreachRecommendations: [...uniqueOutreach.values()].sort(
      (a, b) => b.impactScore - a.impactScore,
    ),
  };
}
