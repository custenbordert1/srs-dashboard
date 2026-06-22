/** Server and test entrypoint — client components must import from ./client instead. */
export { buildPipelineIntelligenceSnapshot } from "@/lib/pipeline-intelligence/build-pipeline-intelligence-snapshot";
export { buildPipelineBottleneckRecommendations } from "@/lib/pipeline-intelligence/accountability-recommendations";
export { PIPELINE_QUEUE_LINKS, pipelineQueueHref, parsePipelineQueueParam } from "@/lib/pipeline-intelligence/queue-links";
export {
  CANONICAL_PIPELINE_STAGES,
  mapToCanonicalPipelineStage,
  STAGE_SLA_HOURS,
} from "@/lib/pipeline-intelligence/stage-mapping";
export { buildFunnelTransitionMetrics, FUNNEL_TRANSITIONS } from "@/lib/pipeline-intelligence/funnel-conversion";
export { buildSlaTracking, SLA_TRACKING_STAGES } from "@/lib/pipeline-intelligence/sla-tracking";
export { formatTerritoryLabel, territoryLabelForDm } from "@/lib/pipeline-intelligence/territory-labels";
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
