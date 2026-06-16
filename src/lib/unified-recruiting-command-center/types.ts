import type { ExecutiveAlert, ExecutiveAlertLinkedCandidate } from "@/lib/alerts/alert-types";
import type {
  ExecutiveAlertActionLogEntry,
  ExecutiveAlertFollowUp,
  ExecutiveAlertStatus,
  FollowUpPriority,
} from "@/lib/alerts/executive-alert-status-types";
import type { DailyActionPlanItem } from "@/lib/executive-daily-action-plan/types";
import type {
  PredictiveRiskForecast,
  PredictiveTerritoryRiskRow,
} from "@/lib/predictive-territory-risk/types";
import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";

export type CommandCenterWorkQueueType = "alert" | "recommendation" | "follow-up" | "daily-action";

export type CommandCenterWorkQueuePriority = FollowUpPriority;

export type CommandCenterWorkQueueItem = {
  id: string;
  type: CommandCenterWorkQueueType;
  priority: CommandCenterWorkQueuePriority;
  territory: string;
  owner: string;
  dueDate: string;
  status: ExecutiveAlertStatus | "open" | "overdue" | "completed";
  impactScore: number;
  impactLabel: string;
  title: string;
  subtitle: string;
  isOverdue: boolean;
  sourceAlertId?: string;
  sourceRecommendationId?: string;
  sourceFollowUpId?: string;
  sourceDailyActionId?: string;
};

export type CommandCenterKpis = {
  openCalls: number;
  criticalTerritories: number;
  zeroPipelineStores: number;
  coveragePercent: number;
  hiringVelocity: number;
  predictedCoverageGap: number;
  actionsDueToday: number;
};

export type CommandCenterProductivityMetrics = {
  actionsCompletedToday: number;
  followUpsResolved: number;
  riskReductionAchieved: number;
  coverageGained: number;
  hiresInfluenced: number;
};

export type CommandCenterExecutiveBriefing = {
  headline: string;
  topRisks: string[];
  topOpportunities: string[];
  territoriesNeedingAttention: string[];
  recommendedActions: string[];
  expectedOutcomes: string[];
};

export type CommandCenterDrawerRiskDetail = {
  riskScore: number;
  riskLevel: string;
  trend: string;
  factors: string[];
  recommendations: string[];
};

export type CommandCenterDrawerContext = {
  queueItemId: string;
  title: string;
  type: CommandCenterWorkQueueType;
  priority: CommandCenterWorkQueuePriority;
  territory: string;
  owner: string;
  status: CommandCenterWorkQueueItem["status"];
  impactLabel: string;
  recommendedNextAction: string;
  alert?: ExecutiveAlert;
  recommendation?: AutopilotRecommendation;
  dailyAction?: DailyActionPlanItem;
  followUp?: ExecutiveAlertFollowUp;
  followUpHistory: ExecutiveAlertFollowUp[];
  actionLogs: ExecutiveAlertActionLogEntry[];
  linkedCandidates: ExecutiveAlertLinkedCandidate[];
  linkedStores: string[];
  linkedProjects: string[];
  riskDetail?: CommandCenterDrawerRiskDetail;
};

export type UnifiedRecruitingCommandCenterSnapshot = {
  generatedAt: string;
  planDate: string;
  kpis: CommandCenterKpis;
  leftColumn: {
    criticalAlerts: ExecutiveAlert[];
    todaysActions: DailyActionPlanItem[];
    overdueFollowUps: ExecutiveAlertFollowUp[];
  };
  centerColumn: {
    territoryRiskDashboard: PredictiveTerritoryRiskRow[];
    coverageForecasts: PredictiveRiskForecast[];
    hiringForecasts: PredictiveRiskForecast[];
  };
  rightColumn: {
    topRecommendations: AutopilotRecommendation[];
    dmPerformanceWatchlist: PredictiveTerritoryRiskRow[];
    projectsAtRisk: PredictiveTerritoryRiskRow[];
  };
  workQueue: CommandCenterWorkQueueItem[];
  briefing: CommandCenterExecutiveBriefing;
  productivityMetrics: CommandCenterProductivityMetrics;
  drawerContextsByQueueId: Record<string, CommandCenterDrawerContext>;
};
