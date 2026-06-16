import type { EffectivenessRating, OutcomeMetrics, RecommendationRecord } from "@/lib/recommendation-intelligence/types";

export type RoiCategory =
  | "High ROI"
  | "Medium ROI"
  | "Low ROI"
  | "Negative ROI"
  | "Not enough data";

export type TrustFlag =
  | "Proven"
  | "Promising"
  | "Unproven"
  | "Needs review"
  | "Poor performer";

export type OutcomeDelta = OutcomeMetrics;

export type ExecutiveImpactSummary = {
  applicantsGenerated: number;
  interviewsGenerated: number;
  hiresGenerated: number;
  coverageGained: number;
  openCallsReduced: number;
  projectsImproved: number;
  risksReduced: number;
  trackedActions: number;
  scoredActions: number;
};

export type ActionPerformanceRow = {
  recommendationType: string;
  label: string;
  successRate: number;
  averageApplicantGain: number;
  averageHireGain: number;
  averageCoverageGain: number;
  averageOpenCallReduction: number;
  averageRiskReduction: number;
  roiCategory: RoiCategory;
  trustFlag: TrustFlag;
  totalTracked: number;
};

export type ActualVsExpectedRow = {
  recommendationId: string;
  label: string;
  expectedApplicantGain: number;
  actualApplicantGain: number;
  expectedImpactScore: number;
  effectiveness: EffectivenessRating | null;
  roiCategory: RoiCategory;
  trustFlag: TrustFlag;
};

export type CeoRoiSummary = {
  bestActionWorking: { label: string; successRate: number; trustFlag: TrustFlag } | null;
  worstAction: { label: string; successRate: number; trustFlag: TrustFlag } | null;
  estimatedHiresInfluenced: number;
  coverageGained: number;
  automationRoi: { completedCount: number; successRate: number; summary: string };
};

export type AutomationRoiView = {
  automationId: string;
  expectedRoi: RoiCategory;
  confidenceScore: number;
  projectedApplicantGain: number;
  projectedCoverageGain: number;
  historicalSuccessRate: number;
  trustFlag: TrustFlag;
  actualResult: string | null;
  roiCategory: RoiCategory | null;
  recommendationAccuracy: string | null;
};

export type ExecutiveTrustRoiSnapshot = {
  generatedAt: string;
  executiveImpact: ExecutiveImpactSummary;
  topPerformingActions: ActionPerformanceRow[];
  worstPerformingActions: ActionPerformanceRow[];
  actualVsExpected: ActualVsExpectedRow[];
  trustByType: Record<string, TrustFlag>;
  ceoRoiSummary: CeoRoiSummary;
};
