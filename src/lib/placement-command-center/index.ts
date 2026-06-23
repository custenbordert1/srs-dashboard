export { buildHiringReadinessRows, resolveHiringReadinessStatus } from "@/lib/placement-command-center/build-hiring-readiness";
export { buildPlacementRecommendations } from "@/lib/placement-command-center/build-placement-intelligence";
export { buildPlacementExecutionRecommendations } from "@/lib/placement-command-center/build-placement-recommendation-engine";
export { buildPlacementFunnel } from "@/lib/placement-command-center/build-placement-funnel";
export { buildPlacementCommandCenterSnapshot } from "@/lib/placement-command-center/build-placement-dashboard-snapshot";
export { buildPlacementOutcomeMetrics } from "@/lib/placement-command-center/build-placement-outcomes";
export { planPlacementCorrelations } from "@/lib/placement-command-center/plan-placement-correlations";
export {
  guardPlacementCorrelationMutation,
  validatePlacementCorrelationAccess,
} from "@/lib/placement-command-center/guard-placement-correlation";
export {
  approvePlacementWithAccountability,
  markPlacementNeedsReviewWithAccountability,
  P61_SOURCE_PHASE,
  recordPlacementRecommendationInAccountability,
  rejectPlacementWithAccountability,
} from "@/lib/placement-command-center/bridge-p61-accountability";
export { executePlacementCorrelation } from "@/lib/placement-command-center/bridge-placement-execution";
export type {
  AutoPlacementOpportunity,
  CoverageGapAwaitingCandidate,
  HiringReadinessRow,
  HiringReadinessStatus,
  PaperworkBottleneck,
  PlacementCommandCenterSnapshot,
  PlacementConfidence,
  PlacementExecutionRecommendation,
  PlacementFitScores,
  PlacementFunnelStage,
  PlacementMatchLabel,
  PlacementOutcomeMetrics,
  PlacementQueueItem,
  PlacementRecommendation,
  TimeToFillMetric,
} from "@/lib/placement-command-center/types";

export const P60_SOURCE_PHASE = "P60";
export const P60_SOURCE_MODULE = "placement-command-center";
