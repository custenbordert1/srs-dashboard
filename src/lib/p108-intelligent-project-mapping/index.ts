export { buildProjectMappingReport } from "@/lib/p108-intelligent-project-mapping/build-project-mapping-report";
export { recommendCandidateMapping, scoreCandidateAgainstPublishedJob } from "@/lib/p108-intelligent-project-mapping/score-candidate-mapping";
export {
  extractJobSignals,
  titleSimilarityScore,
  clientsMatch,
  projectCodesMatch,
} from "@/lib/p108-intelligent-project-mapping/extract-job-signals";
export {
  buildHistoricalPatterns,
  historicalPatternBonus,
} from "@/lib/p108-intelligent-project-mapping/historical-mapping-patterns";
export {
  loadMappingReviewRecords,
  saveMappingReviewDecision,
  priorDecisionForCandidate,
  mappingReviewStorePath,
} from "@/lib/p108-intelligent-project-mapping/mapping-review-store";
export type {
  CandidateMappingRecommendation,
  MappingDecision,
  MappingFactorScore,
  MappingReviewAction,
  MappingReviewQueueItem,
  MappingReviewRecord,
  ProjectMappingAnalytics,
  ProjectMappingReport,
  P108RunMode,
} from "@/lib/p108-intelligent-project-mapping/types";
export {
  P108_DEFAULT_MODE,
  P108_SOURCE_PHASE,
} from "@/lib/p108-intelligent-project-mapping/types";
