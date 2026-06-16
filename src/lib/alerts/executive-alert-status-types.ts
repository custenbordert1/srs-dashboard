export type ExecutiveAlertStatus = "new" | "in-review" | "snoozed" | "resolved";

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

export const DEFAULT_EXECUTIVE_ALERT_STATUS: ExecutiveAlertStatus = "new";
