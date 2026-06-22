/** Client-safe pipeline intelligence exports — no server-only loaders or snapshot builders. */
export { PIPELINE_QUEUE_LINKS, pipelineQueueHref, parsePipelineQueueParam } from "@/lib/pipeline-intelligence/queue-links";
export type {
  BottleneckSeverity,
  CandidateAgingBucket,
  ExecutivePipelineHealth,
  FunnelConversionTrend,
  FunnelTransitionMetric,
  PipelineBottleneck,
  PipelineBottleneckRecommendation,
  PipelineIntelligenceSnapshot,
  PipelineSlaEntry,
  PipelineStageMetric,
  RecruiterPipelinePerformance,
  TerritoryPipelineFunnel,
} from "@/lib/pipeline-intelligence/types";
