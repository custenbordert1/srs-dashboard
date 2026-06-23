import type { AutonomousRecruitingSnapshot } from "@/lib/autonomous-recruiting-engine/types";
import type { RecruitingExecutionSnapshot } from "@/lib/autonomous-recruiting-execution";
import type { PipelineIntelligenceSnapshot } from "@/lib/pipeline-intelligence/types";

export type AutopilotOperatingMode = "manual" | "semi-automatic" | "automatic";

export type AutopilotPolicy = {
  mode: AutopilotOperatingMode;
  paused: boolean;
  updatedAt: string;
  lastRunAt?: string;
  pausedAt?: string;
  pausedBy?: string;
};

export type AutopilotRunEntry = {
  id: string;
  startedAt: string;
  completedAt: string;
  mode: AutopilotOperatingMode;
  paused: boolean;
  recommendationsPlanned: number;
  autoApproved: number;
  executed: number;
  failed: number;
  matchedRuleIds: string[];
  errors: string[];
};

export type AutopilotPerformanceMetrics = {
  recommendationsGenerated: number;
  recommendationsApproved: number;
  recommendationsExecuted: number;
  postingSuccessRate: number;
  applicantConversionRate: number;
  timeToFillDays: number | null;
  coverageRiskReduction: number;
  hiringSuccessRate: number;
  pipelineConversionPct: number | null;
  territoriesAtRisk: number;
};

export type RecommendationEffectivenessRow = {
  key: string;
  territory: string;
  recommendationType: string;
  postingAction?: string;
  generated: number;
  executed: number;
  successful: number;
  effectivenessScore: number;
  avgApplicantsAfter: number;
  avgReadyForMel: number;
};

export type RecommendationFeedbackSnapshot = {
  fetchedAt: string;
  rows: RecommendationEffectivenessRow[];
  topPerforming: RecommendationEffectivenessRow[];
  lowestPerforming: RecommendationEffectivenessRow[];
  territoryWeights: Record<string, number>;
  typeWeights: Record<string, number>;
};

export type AutopilotDashboardSnapshot = {
  fetchedAt: string;
  policy: AutopilotPolicy;
  status: "active" | "paused" | "manual";
  autoApprovedToday: number;
  executedToday: number;
  coverageRiskReduced: number;
  territoriesImproved: number;
  awaitingApproval: number;
  performance: AutopilotPerformanceMetrics;
  feedback: RecommendationFeedbackSnapshot;
  recentRuns: AutopilotRunEntry[];
  topPerforming: RecommendationEffectivenessRow[];
  lowestPerforming: RecommendationEffectivenessRow[];
};

export type AutopilotPlanningResult = {
  run: AutopilotRunEntry;
  snapshot: AutonomousRecruitingSnapshot;
  executionSnapshot: RecruitingExecutionSnapshot;
  pipelineSnapshot?: PipelineIntelligenceSnapshot;
};

export type RecommendationFeedbackIndex = {
  territoryWeights: Record<string, number>;
  typeWeights: Record<string, number>;
};
