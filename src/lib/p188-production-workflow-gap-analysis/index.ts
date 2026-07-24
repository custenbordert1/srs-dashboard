/** P188 — Production workflow gap analysis (read-only). */

export {
  P188_SOURCE_PHASE,
  P188_SCHEMA_VERSION,
} from "@/lib/p188-production-workflow-gap-analysis/types";
export type {
  P188LifecycleBucket,
  P188StageStats,
  P188CandidateClassification,
  P188HiringRecommendationGap,
  P188CodePathNode,
  P188Recommendation,
  P188SafetyWalls,
  P188AnalysisReport,
} from "@/lib/p188-production-workflow-gap-analysis/types";

export {
  redactId,
  emptyBucketCounts,
  classifyFurthestLegitimateStage,
  ageDays,
  averageAgeDays,
  BUCKET_ORDER,
} from "@/lib/p188-production-workflow-gap-analysis/classify";

export {
  buildStageStats,
  buildHiringRecommendationGaps,
} from "@/lib/p188-production-workflow-gap-analysis/analyze";

export {
  buildHiringRecommendationCodePath,
  buildGapRecommendations,
  buildFlowDiagramMarkdown,
} from "@/lib/p188-production-workflow-gap-analysis/codePath";

export {
  resolveCommit,
  P188_SAFETY,
  runProductionGapAnalysis,
  summarizeClassificationsForArtifact,
} from "@/lib/p188-production-workflow-gap-analysis/report";
