import type { DistrictManager } from "@/lib/dm-territory-map";
import type { UserRole } from "@/lib/auth/types";

export type NotificationSeverity = "info" | "warning" | "critical";

export type NotificationAudience = "recruiter" | "dm" | "executive";

export type NotificationChannel = "in-app" | "email" | "sms" | "teams";

export type NotificationLifecycleStatus = "active" | "read" | "dismissed" | "resolved";

export type NotificationRuleId =
  | "recruiter-new-applicant"
  | "recruiter-follow-up-due"
  | "recruiter-candidate-aging"
  | "recruiter-paperwork-not-started"
  | "recruiter-paperwork-pending"
  | "dm-coverage-risk"
  | "dm-zero-applicant-jobs"
  | "dm-low-applicant-flow"
  | "dm-open-calls-inactive"
  | "dm-territory-health-declining"
  | "executive-critical-territory"
  | "executive-recruiter-workload"
  | "executive-hiring-velocity-decline"
  | "executive-open-calls-at-risk";

export type AutomationRule = {
  id: NotificationRuleId;
  label: string;
  trigger: string;
  condition: string;
  action: string;
  severity: NotificationSeverity;
  recipient: NotificationAudience;
  channels: NotificationChannel[];
  enabled: boolean;
};

export type NotificationAuditEntry = {
  id: string;
  at: string;
  actorUserId: string;
  actorUserName: string;
  actorRole: UserRole;
  action: "generated" | "read" | "dismissed" | "resolved" | "delivered";
  channel?: NotificationChannel;
  note?: string;
};

export type NotificationRecord = {
  id: string;
  sourceKey: string;
  ruleId: NotificationRuleId;
  title: string;
  message: string;
  severity: NotificationSeverity;
  audience: NotificationAudience;
  recruiterName: string | null;
  dmName: DistrictManager | null;
  territoryStates: string[];
  state: string | null;
  city: string | null;
  candidateId: string | null;
  jobId: string | null;
  channels: NotificationChannel[];
  status: NotificationLifecycleStatus;
  createdAt: string;
  updatedAt: string;
  readAt: string | null;
  dismissedAt: string | null;
  resolvedAt: string | null;
  auditHistory: NotificationAuditEntry[];
};

export type NotificationMetrics = {
  alertsGenerated: number;
  alertsResolved: number;
  activeCriticalAlerts: number;
  avgResolutionTimeHours: number | null;
  unreadCount: number;
};

export type NotificationCenterSnapshot = {
  fetchedAt: string;
  notifications: NotificationRecord[];
  metrics: NotificationMetrics;
  rules: AutomationRule[];
  filterOptions: {
    recruiters: string[];
    territoryStates: string[];
    severities: NotificationSeverity[];
  };
};

export type NotificationStoreOverlay = {
  sourceKey: string;
  userId: string;
  status: NotificationLifecycleStatus;
  readAt: string | null;
  dismissedAt: string | null;
  resolvedAt: string | null;
  auditHistory: NotificationAuditEntry[];
  updatedAt: string;
};
