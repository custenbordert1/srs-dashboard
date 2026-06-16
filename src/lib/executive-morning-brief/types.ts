import type { CeoRoiSummary } from "@/lib/executive-trust-roi/types";
import type { TrustFlag } from "@/lib/executive-trust-roi/types";
import type { EffectivenessRating } from "@/lib/recommendation-intelligence/types";
import type { PredictiveRiskLevel, PredictiveRiskTrend } from "@/lib/predictive-territory-risk/types";
import type { HiringForecastHorizon } from "@/lib/workforce-capacity-forecast/types";
import type { DashboardTabId } from "@/lib/recruiting-tab-source-labels";

export type TrafficLight = "green" | "yellow" | "red";

export type TrendDirection = "up" | "down" | "flat";

export type MetricTrendComparison = {
  direction: TrendDirection;
  delta: number;
  label: string;
};

export type ScorecardMetric = {
  key: string;
  label: string;
  value: number;
  format: "number" | "percent" | "score";
  trends: {
    vsYesterday: MetricTrendComparison;
    vsLastWeek: MetricTrendComparison;
    vsLastMonth: MetricTrendComparison;
  };
};

export type MorningBriefPriority = {
  rank: number;
  title: string;
  impactScore: number;
  owner: string | null;
  expectedResult: string;
  recommendedAction: string;
  sourceType: "daily-action" | "autopilot" | "alert" | "automation";
  sourceId: string;
  territory: string | null;
  dueDate: string | null;
  navigationTabId: DashboardTabId;
  navigationElementId?: string;
};

export type TerritoryRiskSummaryRow = {
  rank: number;
  territoryLabel: string;
  dmName: string;
  riskLevel: PredictiveRiskLevel;
  coveragePercent: number;
  openCalls: number;
  applicants: number;
  activeReps: number;
  riskTrend: PredictiveRiskTrend;
  riskScore: number;
};

export type RecruiterPerformanceRow = {
  recruiter: string;
  openPositions: number;
  applicants: number;
  interviews: number;
  placements: number;
  responseTimeHours: number | null;
  pipelineHealth: "strong" | "moderate" | "weak";
  productivityScore: number;
};

export type CoverageForecastHorizonSummary = {
  horizon: HiringForecastHorizon;
  expectedOpenCalls: number;
  expectedFilledCalls: number;
  expectedCoveragePercent: number;
  projectedRiskScore: number;
  riskTrend: PredictiveRiskTrend;
};

export type AutomationOpportunitySummary = {
  id: string;
  actionType: string;
  title: string;
  expectedImpact: string;
  approvalStatus: string;
  impactScore: number;
};

export type RecommendationTypeSummary = {
  recommendationType: string;
  label: string;
  successRate: number;
  trackedCount: number;
  trendChange: number | null;
};

export type ExecutiveNarratives = {
  today: string;
  thisWeek: string;
  outlook30Day: string;
};

export type EmailDigestDraft = {
  subject: string;
  generatedAt: string;
  recipients: string[];
  sections: {
    executiveSummary: string;
    topRisks: string[];
    topOpportunities: string[];
    forecast: string;
    recommendedActions: string[];
  };
  bodyText: string;
};

export type CeoRiskItem = {
  title: string;
  detail: string;
  territory: string | null;
  light: TrafficLight;
};

export type CeoRecommendedAction = {
  id: string;
  title: string;
  expectedImpact: string;
  owner: string | null;
  dueDate: string | null;
  impactScore: number;
  navigationTabId: DashboardTabId;
  navigationElementId?: string;
};

export type CeoHomeSnapshot = {
  narrative: string;
  onTrack: TrafficLight;
  recruitingHealth: { score: number; light: TrafficLight; label: ExecutiveMorningBriefSnapshot["recruitingHealth"]["tier"] };
  coverage: { score: number; light: TrafficLight; trendLabel: string };
  hiringForecast: { summary: string; light: TrafficLight; horizon14Coverage: number | null };
  criticalTerritories: TerritoryRiskSummaryRow[];
  topPriorities: MorningBriefPriority[];
  topRisks: CeoRiskItem[];
  topOpportunities: RecommendationTypeSummary[];
  automationQueue: {
    pendingApprovals: number;
    draftCount: number;
    summary: string;
    light: TrafficLight;
  };
  recommendedActions: CeoRecommendedAction[];
  roiSummary: CeoRoiSummary;
};

export type ExecutiveMorningBriefSnapshot = {
  generatedAt: string;
  planDate: string;
  ceoHome: CeoHomeSnapshot;
  scorecard: ScorecardMetric[];
  recruitingHealth: {
    score: number;
    tier: "critical" | "at-risk" | "stable" | "healthy";
    summary: string;
  };
  dailyPriorities: MorningBriefPriority[];
  territoryRisks: TerritoryRiskSummaryRow[];
  recruiterPerformance: {
    rows: RecruiterPerformanceRow[];
    topPerformers: RecruiterPerformanceRow[];
    needsAttention: RecruiterPerformanceRow[];
  };
  coverageForecast: CoverageForecastHorizonSummary[];
  automationOpportunities: {
    jobRefreshDrafts: number;
    postingDrafts: number;
    followUpCampaigns: number;
    pendingApprovals: number;
    highestImpact: AutomationOpportunitySummary[];
  };
  recommendationIntelligence: {
    topPerforming: RecommendationTypeSummary[];
    worstPerforming: RecommendationTypeSummary[];
    overallSuccessRate: number;
    roiHighlights: Array<{
      recommendationId: string;
      label: string;
      effectiveness: EffectivenessRating | null;
      roiScore: number;
    }>;
    roiSummary: CeoRoiSummary;
    trustByType: Record<string, TrustFlag>;
  };
  executiveRecommendations: Array<{
    id: string;
    title: string;
    impactScore: number;
    confidenceScore: number;
    category: string;
  }>;
  narratives: ExecutiveNarratives;
  emailDigest: EmailDigestDraft;
};
