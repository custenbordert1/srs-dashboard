export type {
  CoverageRecommendation,
  CoverageJobSignals,
  RecruiterDecisionIntelligenceSnapshot,
  RecruiterSuggestedAction,
  RecruiterSuggestedActionType,
  TerritoryIntelligenceSnapshot,
  TerritoryMarketRow,
  VariantPerformanceRow,
} from "@/lib/recruiting-decision-intelligence/types";

export { buildRecruiterDecisionIntelligence } from "@/lib/recruiting-decision-intelligence/build-decision-intelligence";
export { dedupeRecruiterSuggestedActions } from "@/lib/recruiting-decision-intelligence/recommendation-dedupe";
export { assertRecommendationsOnly, DECISION_INTELLIGENCE_ALLOWS_AUTOMATION } from "@/lib/recruiting-decision-intelligence/automation-guard";
