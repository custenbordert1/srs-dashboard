import type { DashboardTabId } from "@/lib/recruiting-tab-source-labels";

export type PredictiveRiskTrend = "improving" | "stable" | "declining";

export type PredictiveRiskLevel = "stable" | "moderate" | "high" | "critical";

export type PredictiveRiskEntityType = "territory" | "dm" | "project" | "store-cluster";

export type PredictiveRiskRecommendationKind =
  | "increase-ads"
  | "refresh-jobs"
  | "expand-radius"
  | "increase-pay"
  | "reassign-recruiter"
  | "escalate-dm";

export type PredictiveRiskFactors = {
  openCallsPressure: number;
  pipelineDepthRisk: number;
  applicationVelocityRisk: number;
  hiringVelocityRisk: number;
  coverageGapRisk: number;
  completionTrendRisk: number;
  deadlinePressure: number;
  alertVolumeRisk: number;
  followUpBacklogRisk: number;
};

export type PredictiveRiskNavigation = {
  tabId: DashboardTabId;
  elementId?: string;
  label: string;
};

export type PredictiveRiskRecommendation = {
  kind: PredictiveRiskRecommendationKind;
  label: string;
  reason: string;
  navigation: PredictiveRiskNavigation;
};

export type PredictiveTerritoryRiskRow = {
  entityId: string;
  entityType: PredictiveRiskEntityType;
  label: string;
  dmName: string;
  states: string[];
  riskScore: number;
  riskLevel: PredictiveRiskLevel;
  trend: PredictiveRiskTrend;
  factors: PredictiveRiskFactors;
  openCalls: number;
  coveragePercent: number;
  pipelineDepth: number;
  alertCount: number;
  followUpCount: number;
  recommendations: PredictiveRiskRecommendation[];
  navigation: PredictiveRiskNavigation;
};

export type PredictiveRiskForecastKind =
  | "zero-pipeline-store"
  | "territory-miss-completion"
  | "dm-coverage-miss";

export type PredictiveRiskForecast = {
  id: string;
  kind: PredictiveRiskForecastKind;
  label: string;
  dmName: string;
  confidence: number;
  reason: string;
  navigation: PredictiveRiskNavigation;
};

export type PredictiveTerritoryRiskExecutiveSummary = {
  totalCriticalTerritories: number;
  totalHighRiskTerritories: number;
  projectsAtRisk: number;
  predictedCoverageGap: number;
};

export type PredictiveTerritoryRiskSnapshot = {
  generatedAt: string;
  executiveSummary: PredictiveTerritoryRiskExecutiveSummary;
  highestRiskTerritories: PredictiveTerritoryRiskRow[];
  healthiestTerritories: PredictiveTerritoryRiskRow[];
  forecasts: PredictiveRiskForecast[];
  territories: PredictiveTerritoryRiskRow[];
  projects: PredictiveTerritoryRiskRow[];
  storeClusters: PredictiveTerritoryRiskRow[];
};
