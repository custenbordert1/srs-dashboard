export {
  buildCoverageOptimizationSnapshot,
  type CoverageOptimizationContext,
} from "@/lib/coverage-optimization/build-coverage-optimization-snapshot";
export { simulateCoverageChange, type CoverageSimulationInput } from "@/lib/coverage-optimization/coverage-simulator";
export { prioritizeOpenCalls } from "@/lib/coverage-optimization/open-call-prioritizer";
export {
  buildRepRecommendation,
  buildRepRecommendations,
} from "@/lib/coverage-optimization/rep-recommendation-engine";
export { buildRoutePlan } from "@/lib/coverage-optimization/route-builder-engine";
export {
  estimateDriveTimeMinutes,
  estimateMileageCostUsd,
  estimateProjectTravelCostUsd,
  MILEAGE_REIMBURSEMENT_RATE_USD,
  ROUTING_PROVIDER_CAPABILITIES,
} from "@/lib/coverage-optimization/travel-cost-model";
export type {
  CoverageOptimizationExecutiveMetrics,
  CoverageOptimizationSnapshot,
  CoverageSimulationDelta,
  OpportunityRepRecommendation,
  PrioritizedOpenCall,
  RoutePlan,
  ScoredRepRecommendation,
} from "@/lib/coverage-optimization/types";
