export {
  distanceBetweenLocations,
  estimateGeoPoint,
  haversineMiles,
  DEFAULT_TRAVEL_RADIUS_MILES,
} from "@/lib/mel-matching/distance-utils";
export { matchCandidateToOpportunities, type MatchCandidateOptions } from "@/lib/mel-matching/matching-engine";
export {
  parseMelOpportunities,
  filterOpportunitiesByTerritory,
} from "@/lib/mel-matching/mel-opportunity-parser";
export { scoreOpportunityFit } from "@/lib/mel-matching/opportunity-fit-scoring";
export {
  buildExecutiveMelMatchingMetrics,
  buildDmMelMatchingMetrics,
  type ExecutiveMelMatchingMetrics,
  type DmMelMatchingMetrics,
  type TopMatchRow,
} from "@/lib/mel-matching/mel-matching-metrics";
export type {
  MatchLabel,
  MelOpportunity,
  MelOpportunityPriority,
  CandidateOpportunityMatch,
  CandidateMatchResult,
} from "@/lib/mel-matching/matching-engine-types";
