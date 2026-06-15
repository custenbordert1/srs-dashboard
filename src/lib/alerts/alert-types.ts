import type { DashboardTabId } from "@/lib/recruiting-tab-source-labels";

export type AlertSeverity = "critical" | "high" | "medium" | "low";

export type AlertCategory =
  | "project"
  | "territory"
  | "recruiter"
  | "placement"
  | "candidate"
  | "coverage";

export type AlertAction =
  | "create-job-ad"
  | "assign-recruiter"
  | "notify-dm"
  | "territory-escalation"
  | "placement-review"
  | "candidate-followup"
  | "paperwork-review";

export type AlertAutomationKind = AlertAction | "coverage-review" | "open-call-recovery";

export type AlertDestination = {
  tabId: DashboardTabId;
  label: string;
  elementId?: string;
};

export type ExecutiveAlert = {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  category: AlertCategory;
  impactScore: number;
  recommendedAction: AlertAction;
  destination: AlertDestination;
  automationKind: AlertAutomationKind;
  manualOnly: true;
  createdAt: string;
  reason: string;
};

export type AlertImpactInputs = {
  severity: AlertSeverity;
  businessImpact?: number;
  openCalls?: number;
  coverageRisk?: number;
  forecastGap?: number;
};

export type AlertSnapshot = {
  generatedAt: string;
  alerts: ExecutiveAlert[];
  criticalAlerts: ExecutiveAlert[];
  highAlerts: ExecutiveAlert[];
  mediumAlerts: ExecutiveAlert[];
  lowAlerts: ExecutiveAlert[];
  topCritical: ExecutiveAlert[];
  topActions: ExecutiveAlert[];
  meta: {
    totalCount: number;
    byCategory: Record<AlertCategory, number>;
    bySeverity: Record<AlertSeverity, number>;
    intelligenceCacheStatus?: string;
  };
};
