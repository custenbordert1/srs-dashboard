export type ExecutiveAlertStatus = "new" | "in-review" | "snoozed" | "resolved";

export type ExecutiveAlertActionKind =
  | "status-change"
  | "note"
  | "follow-up-assigned"
  | "reviewed";

export type FollowUpPriority = "critical" | "high" | "medium" | "low";

export type FollowUpOwnerKind = "dm" | "recruiter";

export type ExecutiveAlertActionLogEntry = {
  id: string;
  alertId: string;
  kind: ExecutiveAlertActionKind;
  timestamp: string;
  reviewedBy: string;
  reviewedByUserId: string;
  status?: ExecutiveAlertStatus;
  previousStatus?: ExecutiveAlertStatus;
  note?: string;
  followUpId?: string;
};

export type ExecutiveAlertFollowUp = {
  id: string;
  alertId: string;
  ownerKind: FollowUpOwnerKind;
  ownerName: string;
  dueDate: string;
  priority: FollowUpPriority;
  createdAt: string;
  createdByUserId: string;
  createdByName: string;
  notes?: string;
  completedAt?: string | null;
};

export type ExecutiveAlertStatusOverlay = {
  alertId: string;
  userId: string;
  status: ExecutiveAlertStatus;
  updatedAt: string;
  snoozedUntil?: string | null;
  note?: string;
};

export const EXECUTIVE_ALERT_STATUS_LABELS: Record<ExecutiveAlertStatus, string> = {
  new: "New",
  "in-review": "In Review",
  snoozed: "Snoozed",
  resolved: "Resolved",
};

export const FOLLOW_UP_PRIORITY_LABELS: Record<FollowUpPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const DEFAULT_EXECUTIVE_ALERT_STATUS: ExecutiveAlertStatus = "new";
