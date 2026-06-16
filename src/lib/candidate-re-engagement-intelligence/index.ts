export type {
  CandidateOpportunitySource,
  CandidateReEngagementExecutiveSummary,
  CandidateReEngagementIntelligenceSnapshot,
  CandidateReEngagementScope,
  CandidateReEngagementSegment,
  OutreachRecommendationKind,
  ReEngagementOpportunity,
  ReEngagementOutreachRecommendation,
  ReEngagementWorkflowAction,
  TerritoryRecoveryForecast,
} from "@/lib/candidate-re-engagement-intelligence/types";

export {
  buildCandidateReEngagementIntelligenceSnapshot,
  type BuildCandidateReEngagementIntelligenceInput,
} from "@/lib/candidate-re-engagement-intelligence/build-snapshot";

export {
  buildRawReEngagementOpportunities,
  classifyOpportunitySource,
  defaultRecommendedAction,
  projectImpactScore,
  territoryImpactScore,
  territoryOpenCalls,
} from "@/lib/candidate-re-engagement-intelligence/opportunity-engine";

export { scorePlacementProbability, scoreReEngagementOpportunity } from "@/lib/candidate-re-engagement-intelligence/scoring";

export { countBySegment, segmentReEngagementCandidate } from "@/lib/candidate-re-engagement-intelligence/segmentation";

export { rankReEngagementOpportunities, scoreOpportunityRanking } from "@/lib/candidate-re-engagement-intelligence/ranking";

export {
  buildExecutiveRecoverySummary,
  buildTerritoryRecoveryForecasts,
} from "@/lib/candidate-re-engagement-intelligence/forecasts";

export {
  buildOutreachRecommendation,
  buildOutreachRecommendationsForRow,
  resolveExpectedOutcome,
  resolveOutreachKind,
  resolveRecommendedTiming,
} from "@/lib/candidate-re-engagement-intelligence/outreach-recommendations";

export {
  candidateIdFromReEngagementAlertId,
  filterReEngagementFollowUps,
  filterReEngagementStatusOverlays,
  followUpDueForCandidate,
  followUpPriorityForAction,
  isReEngagementAlertId,
  mapWorkflowActionToStatus,
  mergeReEngagementWorkflowState,
  reEngagementAlertId,
  workflowNoteForAction,
  workflowStatusForOverlay,
} from "@/lib/candidate-re-engagement-intelligence/workflow-helpers";

