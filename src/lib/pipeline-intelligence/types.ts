import type { CanonicalPipelineStage } from "@/lib/pipeline-intelligence/stage-mapping";

export type BottleneckSeverity = "normal" | "warning" | "high" | "critical";

export type CandidateAgingBucket = "0-2" | "3-5" | "6-10" | "10+";

export type FunnelConversionTrend = "up" | "down" | "flat";

export type FunnelTransitionMetric = {
  id: string;
  label: string;
  fromGroup: number;
  toGroup: number;
  count: number;
  conversionPct: number | null;
  trend: FunnelConversionTrend;
};

export type PipelineSlaEntry = {
  stage: CanonicalPipelineStage;
  label: string;
  slaHours: number;
  count: number;
  beyondSlaCount: number;
  avgDaysInStage: number | null;
  severity: BottleneckSeverity;
  recommendation: string | null;
};

export type PipelineStageMetric = {
  stage: CanonicalPipelineStage;
  count: number;
  /** Progression rate to the next funnel group (not inventory ratio). */
  conversionToNextPct: number | null;
  avgDaysInStage: number | null;
  beyondSlaCount: number;
  bottleneckSeverity: BottleneckSeverity;
};

export type TerritoryPipelineFunnel = {
  territoryLabel: string;
  dmName: string;
  states: string[];
  stages: PipelineStageMetric[];
  totalActive: number;
  topBottleneck: PipelineBottleneck | null;
};

export type PipelineBottleneck = {
  territoryLabel: string;
  dmName: string;
  stage: CanonicalPipelineStage;
  severity: BottleneckSeverity;
  count: number;
  avgDaysInStage: number | null;
  slaHours: number;
  message: string;
};

export type RecruiterPipelinePerformance = {
  recruiter: string;
  assigned: number;
  reviewed: number;
  contacted: number;
  interviewsScheduled: number;
  paperworkSent: number;
  readyForMel: number;
  conversionPct: number;
  avgResponseDays: number | null;
  candidatesWaiting: number;
};

export type ExecutivePipelineHealth = {
  topBottlenecks: PipelineBottleneck[];
  topBottleneckTerritories: Array<{
    territoryLabel: string;
    dmName: string;
    bottleneck: PipelineBottleneck;
  }>;
  bestConversionTerritories: Array<{
    territoryLabel: string;
    dmName: string;
    conversionPct: number;
    avgDaysToMel: number | null;
    mostActiveRecruiter: string | null;
  }>;
  worstConversionTerritories: Array<{
    territoryLabel: string;
    dmName: string;
    conversionPct: number;
    avgDaysToMel: number | null;
    mostActiveRecruiter: string | null;
  }>;
  fastestTimeToMel: Array<{
    territoryLabel: string;
    dmName: string;
    avgDaysToMel: number;
    conversionPct: number;
  }>;
  recruitersNeedingHelp: Array<{
    recruiter: string;
    candidatesWaiting: number;
    assigned: number;
    conversionPct: number;
    avgResponseDays: number | null;
  }>;
  /** @deprecated use bestConversionTerritories */
  bestTerritories: Array<{
    territoryLabel: string;
    dmName: string;
    conversionPct: number;
    avgDaysToMel: number | null;
    mostActiveRecruiter: string | null;
  }>;
};

export type PipelineAgingSummary = {
  bucket: CandidateAgingBucket;
  count: number;
  beyondSlaCount: number;
};

export type PipelineBottleneckRecommendation = {
  id: string;
  kind: "pipeline-bottleneck";
  title: string;
  rationale: string;
  expectedImpact: string;
  priority: "critical" | "high" | "medium" | "low";
  territoryLabel: string;
  owner: string | null;
  stage: CanonicalPipelineStage;
};

export type PipelineIntelligenceSnapshot = {
  generatedAt: string;
  stages: PipelineStageMetric[];
  funnelTransitions: FunnelTransitionMetric[];
  slaTracking: PipelineSlaEntry[];
  territories: TerritoryPipelineFunnel[];
  recruiters: RecruiterPipelinePerformance[];
  aging: PipelineAgingSummary[];
  executive: ExecutivePipelineHealth;
  bottlenecks: PipelineBottleneck[];
  recommendations: PipelineBottleneckRecommendation[];
};
