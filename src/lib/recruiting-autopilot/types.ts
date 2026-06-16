import type { DashboardTabId } from "@/lib/recruiting-tab-source-labels";

export type AutopilotEntityType =
  | "territory"
  | "dm"
  | "recruiter"
  | "job-posting"
  | "project"
  | "store-cluster";

export type AutopilotRecommendationKind =
  | "increase-ad-spend"
  | "refresh-job-posting"
  | "adjust-pay-rate"
  | "expand-recruiting-radius"
  | "escalate-to-dm"
  | "assign-additional-recruiter"
  | "create-candidate-outreach-campaign"
  | "reopen-previous-candidates"
  | "increase-follow-up-frequency"
  | "launch-territory-blitz";

export type AutopilotHorizon = "quick-win" | "long-term";

export type AutopilotSupportingMetric = {
  label: string;
  value: string;
};

export type AutopilotNavigation = {
  tabId: DashboardTabId;
  elementId?: string;
  label: string;
};

export type AutopilotOpportunityScore = {
  currentRisk: number;
  potentialImprovement: number;
  estimatedCandidateGain: number;
  estimatedCoverageGain: number;
  estimatedCompletionGain: number;
  expectedRoiScore: number;
};

export type AutopilotRecommendation = {
  id: string;
  kind: AutopilotRecommendationKind;
  title: string;
  entityType: AutopilotEntityType;
  entityId: string;
  entityLabel: string;
  dmName?: string;
  impactScore: number;
  confidenceScore: number;
  estimatedOutcomeImprovement: number;
  reasoning: string;
  supportingMetrics: AutopilotSupportingMetric[];
  opportunity: AutopilotOpportunityScore;
  prioritizationScore: number;
  horizon: AutopilotHorizon;
  navigation: AutopilotNavigation;
};

export type RecruitingAutopilotExecutiveSummary = {
  topActionsToday: AutopilotRecommendation[];
  expectedAdditionalCandidates: number;
  expectedAdditionalHires: number;
  expectedAdditionalStoreCoverage: number;
  expectedRiskReduction: number;
};

export type RecruitingAutopilotSnapshot = {
  generatedAt: string;
  executiveSummary: RecruitingAutopilotExecutiveSummary;
  highestImpact: AutopilotRecommendation[];
  quickWins: AutopilotRecommendation[];
  longTerm: AutopilotRecommendation[];
  byTerritory: Record<string, AutopilotRecommendation[]>;
  byProject: Record<string, AutopilotRecommendation[]>;
  byDm: Record<string, AutopilotRecommendation[]>;
  all: AutopilotRecommendation[];
};
