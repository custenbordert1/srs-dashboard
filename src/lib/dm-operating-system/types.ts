import type { UserRole } from "@/lib/auth/types";
import type { PredictiveRiskLevel, PredictiveRiskTrend } from "@/lib/predictive-territory-risk/types";
import type {
  CommandCenterDrawerContext,
  CommandCenterWorkQueueItem,
} from "@/lib/unified-recruiting-command-center/types";

export type DmHeatMapHealthStatus = "healthy" | "at-risk" | "critical" | "zero-pipeline";

export type DmOperatingSystemScope = {
  dmName: string;
  territoryLabel: string;
  territoryStates: string[];
  role: UserRole;
  scopedToTerritory: boolean;
};

export type DmOperatingSystemKpis = {
  territoryCoveragePercent: number;
  openCalls: number;
  storesAtRisk: number;
  zeroPipelineStores: number;
  recruiterActivity: number;
  hiringVelocity: number;
  territoryRiskScore: number;
};

export type DmHeatMapStoreRow = {
  id: string;
  storeName: string;
  projectName: string;
  state: string;
  recruiter: string;
  healthStatus: DmHeatMapHealthStatus;
  riskLevel: PredictiveRiskLevel;
  coveragePercent: number;
  openCalls: number;
  pipelineDepth: number;
};

export type DmHeatMapFilters = {
  projects: string[];
  recruiters: string[];
  states: string[];
  riskLevels: PredictiveRiskLevel[];
};

export type DmRecruiterPerformanceTier = "top" | "average" | "needs-support";

export type DmRecruiterPerformanceRow = {
  recruiter: string;
  openReqs: number;
  candidatePipeline: number;
  followUpCompletionPercent: number;
  hiringVelocity: number;
  coverageContribution: number;
  performanceTier: DmRecruiterPerformanceTier;
};

export type DmTerritoryForecastHorizon = "7d" | "14d" | "30d";

export type DmTerritoryForecast = {
  horizon: DmTerritoryForecastHorizon;
  coveragePercent: number;
  completionPercent: number;
  openCallReduction: number;
  riskTrend: PredictiveRiskTrend;
};

export type DmDailyPlanAction = {
  rank: number;
  id: string;
  title: string;
  whyItMatters: string;
  expectedImpact: string;
  recommendedNextStep: string;
  owner: string;
  dueDate: string;
  expectedCoverageGain: number;
  expectedHireGain: number;
};

export type DmEscalationCategory =
  | "executive-attention"
  | "additional-budget"
  | "pay-adjustment"
  | "territory-assistance";

export type DmEscalationItem = {
  id: string;
  category: DmEscalationCategory;
  title: string;
  detail: string;
  impactScore: number;
  recommendedAction: string;
  territory?: string;
  state?: string;
};

export type DmOperatingSystemSnapshot = {
  generatedAt: string;
  planDate: string;
  scope: DmOperatingSystemScope;
  kpis: DmOperatingSystemKpis;
  actionQueue: CommandCenterWorkQueueItem[];
  heatMap: {
    stores: DmHeatMapStoreRow[];
    filters: DmHeatMapFilters;
  };
  recruiterPerformance: {
    recruiters: DmRecruiterPerformanceRow[];
    topPerformers: string[];
    needsSupport: string[];
  };
  forecast: DmTerritoryForecast[];
  dailyPlan: DmDailyPlanAction[];
  escalationCenter: DmEscalationItem[];
  drawerContextsByQueueId: Record<string, CommandCenterDrawerContext>;
};
