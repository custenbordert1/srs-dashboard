import type { ExecutiveAlertStatus } from "@/lib/alerts/executive-alert-status-types";
import type { AutopilotRecommendation } from "@/lib/recruiting-autopilot/types";
import type { DashboardTabId } from "@/lib/recruiting-tab-source-labels";

export type DailyActionBucket = "must-do-today" | "should-do-this-week" | "monitor-only";

export type DailyActionLink = {
  recommendationId: string;
  recommendationKind: AutopilotRecommendation["kind"];
  recommendationTitle: string;
  riskScore: number;
  relatedAlertId?: string;
  relatedAlertTitle?: string;
};

export type DailyActionNavigation = {
  tabId: DashboardTabId;
  elementId?: string;
  label: string;
};

export type DailyActionPlanItem = {
  id: string;
  alertId: string;
  bucket: DailyActionBucket;
  title: string;
  owner: string;
  ownerKind: "dm" | "recruiter" | "operations";
  dueDate: string;
  expectedImpact: number;
  expectedCoverageGain: number;
  expectedHireGain: number;
  reasoning: string;
  links: DailyActionLink;
  navigation: DailyActionNavigation;
  status: ExecutiveAlertStatus;
  recommendation: AutopilotRecommendation;
};

export type DailyActionPlanExecutiveSummary = {
  criticalActionsToday: number;
  projectedCoverageGain: number;
  projectedHireGain: number;
  riskReduction: number;
  mustDoCount: number;
  shouldDoCount: number;
  monitorCount: number;
};

export type DailyActionPlanSnapshot = {
  generatedAt: string;
  planDate: string;
  executiveSummary: DailyActionPlanExecutiveSummary;
  topActionsToday: DailyActionPlanItem[];
  mustDoToday: DailyActionPlanItem[];
  shouldDoThisWeek: DailyActionPlanItem[];
  monitorOnly: DailyActionPlanItem[];
  all: DailyActionPlanItem[];
};
