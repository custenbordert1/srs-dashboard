import type { AutopilotRecommendationKind } from "@/lib/recruiting-autopilot/types";

export type RecommendationTrackingStatus =
  | "Executed"
  | "Ignored"
  | "In Progress"
  | "Completed";

export type EffectivenessRating =
  | "Highly Effective"
  | "Effective"
  | "Neutral"
  | "Ineffective"
  | "Negative Impact";

export type RecommendationSource =
  | "autopilot"
  | "daily-action"
  | "alert"
  | "forecast";

export type RecommendationType =
  | AutopilotRecommendationKind
  | "alert-action"
  | "forecast-risk";

export type OutcomeCheckpointDay = "day0" | "day7" | "day14" | "day30";

export type OutcomeMetrics = {
  applicants: number;
  interviews: number;
  offers: number;
  newHires: number;
  coveragePercent: number;
  openCalls: number;
  riskScore: number;
  projectCompletionPercent: number;
};

export type RecommendationScope = {
  territory: string | null;
  recruiter: string | null;
  project: string | null;
  dmName: string | null;
  entityId: string | null;
  entityType: string | null;
};

export type RecommendationRecord = {
  recommendationId: string;
  recommendationType: RecommendationType;
  source: RecommendationSource;
  createdDate: string;
  owner: string | null;
  territory: string | null;
  recruiter: string | null;
  project: string | null;
  dmName: string | null;
  expectedOutcome: string;
  expectedImpactScore: number;
  expectedApplicantGain: number;
  status: RecommendationTrackingStatus;
  executionDate: string | null;
  expiresAt: string;
  effectiveness: EffectivenessRating | null;
  effectivenessScoredAt: string | null;
  baselineMetrics: OutcomeMetrics | null;
  outcomeCheckpoints: Record<OutcomeCheckpointDay, OutcomeMetrics | null>;
  scope: RecommendationScope;
};

export type RecommendationTypePerformance = {
  recommendationType: RecommendationType;
  label: string;
  successRate: number;
  totalTracked: number;
  highlyEffectiveCount: number;
  ineffectiveCount: number;
  averageApplicantGain: number;
};

export type RecommendationOwnerPerformance = {
  owner: string;
  ownerKind: "dm" | "recruiter" | "operations";
  successRate: number;
  trackedCount: number;
  completedCount: number;
};

export type RecommendationRoiLeaderboardEntry = {
  recommendationId: string;
  recommendationType: RecommendationType;
  label: string;
  owner: string | null;
  territory: string | null;
  expectedApplicantGain: number;
  actualApplicantGain: number;
  effectiveness: EffectivenessRating | null;
  roiScore: number;
  status: RecommendationTrackingStatus;
};

export type EffectivenessTrendPoint = {
  period: string;
  successRate: number;
  trackedCount: number;
  highlyEffectiveCount: number;
};

export type RecommendationIntelligenceExecutiveSummary = {
  totalTracked: number;
  inProgressCount: number;
  completedCount: number;
  ignoredCount: number;
  overallSuccessRate: number;
  topPerformingType: string | null;
  worstPerformingType: string | null;
  averageApplicantGain: number;
};

export type RecommendationIntelligenceSnapshot = {
  generatedAt: string;
  planDate: string;
  executiveSummary: RecommendationIntelligenceExecutiveSummary;
  topPerformingTypes: RecommendationTypePerformance[];
  worstPerformingTypes: RecommendationTypePerformance[];
  successRateByDm: RecommendationOwnerPerformance[];
  successRateByRecruiter: RecommendationOwnerPerformance[];
  successRateByProject: RecommendationOwnerPerformance[];
  roiLeaderboard: RecommendationRoiLeaderboardEntry[];
  effectivenessTrends: EffectivenessTrendPoint[];
  recentRecords: RecommendationRecord[];
  learnedConfidenceAdjustments: Record<string, number>;
};

export type RecommendationLeaderboardSnapshot = {
  generatedAt: string;
  roiLeaderboard: RecommendationRoiLeaderboardEntry[];
  topPerformingTypes: RecommendationTypePerformance[];
  worstPerformingTypes: RecommendationTypePerformance[];
};

export const OUTCOME_CHECKPOINT_DAYS: OutcomeCheckpointDay[] = ["day0", "day7", "day14", "day30"];

export const RECOMMENDATION_TRACKING_EXPIRY_DAYS = 30;
