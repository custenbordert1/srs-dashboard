export type {
  EffectivenessRating,
  EffectivenessTrendPoint,
  OutcomeCheckpointDay,
  OutcomeMetrics,
  RecommendationIntelligenceExecutiveSummary,
  RecommendationIntelligenceSnapshot,
  RecommendationLeaderboardSnapshot,
  RecommendationOwnerPerformance,
  RecommendationRecord,
  RecommendationRoiLeaderboardEntry,
  RecommendationScope,
  RecommendationSource,
  RecommendationTrackingStatus,
  RecommendationType,
  RecommendationTypePerformance,
} from "@/lib/recommendation-intelligence/types";
export {
  OUTCOME_CHECKPOINT_DAYS,
  RECOMMENDATION_TRACKING_EXPIRY_DAYS,
} from "@/lib/recommendation-intelligence/types";
export { extractOutcomeMetrics, diffOutcomeMetrics } from "@/lib/recommendation-intelligence/metrics";
export {
  scoreEffectiveness,
  computeSuccessRate,
  computeTypeSuccessRate,
  computeRoiScore,
  isSuccessfulEffectiveness,
} from "@/lib/recommendation-intelligence/scoring";
export {
  adjustConfidenceScore,
  applyLearnedConfidenceToRecommendations,
  buildLearnedSuccessRates,
  summarizeLearnedAdjustments,
} from "@/lib/recommendation-intelligence/confidence-adjustment";
export {
  buildRecommendationRecord,
  executeRecommendationRecord,
  listRecommendationRecords,
  markRecommendationApproved,
  markRecommendationExecuted,
  upsertRecommendationRecords,
} from "@/lib/recommendation-intelligence/store";
export { syncRecommendationRecords } from "@/lib/recommendation-intelligence/sync-recommendations";
export {
  processRecommendationOutcomes,
  scoreExpiredRecommendation,
  summarizeActualGain,
  updateRecommendationOutcomeCheckpoints,
} from "@/lib/recommendation-intelligence/outcome-tracking";
export {
  buildOwnerPerformanceBreakdown,
  buildRecommendationLeaderboardSnapshot,
  buildRoiLeaderboard,
  buildTypePerformance,
  computeOverallSuccessRate,
} from "@/lib/recommendation-intelligence/build-leaderboard";
export {
  buildRecommendationIntelligenceSnapshot,
  type BuildRecommendationIntelligenceInput,
} from "@/lib/recommendation-intelligence/build-snapshot";
