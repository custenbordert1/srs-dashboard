export {
  P68_PREVIEW_MODE,
  P68_SOURCE_PHASE,
  P68_1_SOURCE_PHASE,
  WORKFORCE_PLACEMENT_PIPELINE_STAGES,
} from "@/lib/workforce-placement-intelligence/types";
export type {
  HumanReviewQueueEntry,
  MarketCapacityPlan,
  MarketCapacityStatus,
  MarketIntelligenceRow,
  MarketRecommendationReason,
  PlacementCandidateInput,
  PlacementEligibilityResult,
  PriorityMarketOverride,
  WorkforceMarketRecommendation,
  WorkforcePlacementCandidateSnapshot,
  WorkforcePlacementDashboardSnapshot,
  WorkforcePlacementPreviewResult,
} from "@/lib/workforce-placement-intelligence/types";
export { toPlacementCandidateInput } from "@/lib/workforce-placement-intelligence/types";

export {
  buildMarketCapacityPlan,
  buildMarketCapacityPlans,
  buildWorkforcePlanningMetrics,
  capacityStatusLabel,
} from "@/lib/workforce-placement-intelligence/build-market-capacity-plan";
export { buildPlacementEligibility, isReadyForWorkCandidate } from "@/lib/workforce-placement-intelligence/build-placement-eligibility";
export {
  buildDemandFactorsSummary,
  buildMarketIntelligenceSnapshot,
  describeCoverageImpact,
  scoreCandidateMarketFit,
} from "@/lib/workforce-placement-intelligence/build-market-intelligence";
export {
  buildWorkforceMarketRecommendation,
  buildWorkforceMarketRecommendations,
} from "@/lib/workforce-placement-intelligence/build-market-recommendation";
export { buildHumanReviewQueue } from "@/lib/workforce-placement-intelligence/build-human-review-queue";
export { buildWorkforcePlacementDashboardSnapshot } from "@/lib/workforce-placement-intelligence/build-workforce-placement-dashboard";
export {
  buildWorkforcePlacementCandidatePreview,
  runWorkforcePlacementPreview,
} from "@/lib/workforce-placement-intelligence/run-workforce-placement-preview";
export { MARKET_CAPACITY_CONFIG } from "@/lib/workforce-placement-intelligence/market-capacity-registry";
export {
  PREVIEW_PRIORITY_MARKET_OVERRIDES,
  buildMarketKey,
  formatMarketLabel,
  listActivePriorityMarketOverrides,
  resolvePriorityOverride,
} from "@/lib/workforce-placement-intelligence/priority-market-overrides";
