import type { DmAlertPriority } from "@/lib/dm-dashboard/dm-alert-priority";

export type OperationalEscalationType =
  | "request-repost"
  | "request-new-ad"
  | "request-recruiter-assignment"
  | "expand-radius"
  | "request-pay-review"
  | "escalate-recruiting"
  | "coverage-concern"
  | "low-applicant-flow"
  | "aging-job-review";

export const OPERATIONAL_ESCALATION_LABELS: Record<OperationalEscalationType, string> = {
  "request-repost": "Request repost",
  "request-new-ad": "Request new ad",
  "request-recruiter-assignment": "Request recruiter assignment",
  "expand-radius": "Expand radius",
  "request-pay-review": "Request pay review",
  "escalate-recruiting": "Escalate recruiting priority",
  "coverage-concern": "Coverage concern",
  "low-applicant-flow": "Low applicant flow",
  "aging-job-review": "Aging job review",
};

export type RecruiterEscalationQueueStatus = "new" | "in_review" | "completed" | "dismissed";

export const RECRUITER_ESCALATION_STATUS_LABELS: Record<RecruiterEscalationQueueStatus, string> = {
  new: "New",
  in_review: "In Review",
  completed: "Completed",
  dismissed: "Dismissed",
};

export type RecruiterEscalationActivityAction = "created" | "status_change" | "note";

export type RecruiterEscalationActivity = {
  id: string;
  at: string;
  actorUserId: string;
  actorUserName: string;
  actorRole: string;
  action: RecruiterEscalationActivityAction;
  fromStatus?: RecruiterEscalationQueueStatus;
  toStatus?: RecruiterEscalationQueueStatus;
  note?: string;
};

export type RecruiterEscalationQueueItem = {
  id: string;
  escalationType: OperationalEscalationType;
  dmName: string;
  dmUserId: string;
  territory: string;
  territoryStates: string[];
  state: string;
  city: string;
  relatedJobId: string;
  jobTitle: string;
  priority: DmAlertPriority | null;
  priorityScore: number | null;
  recommendedAction: string;
  alertReason: string;
  jobAgeDays: number | null;
  createdAt: string;
  updatedAt: string;
  status: RecruiterEscalationQueueStatus;
  internalNotes: string[];
  activity: RecruiterEscalationActivity[];
  sourceEscalationLogId?: string;
};

export type CreateRecruiterEscalationInput = {
  escalationType: OperationalEscalationType;
  dmName: string;
  dmUserId: string;
  territory: string;
  territoryStates: string[];
  state: string;
  city: string;
  relatedJobId: string;
  jobTitle: string;
  priority?: DmAlertPriority | null;
  priorityScore?: number | null;
  recommendedAction?: string;
  alertReason?: string;
  jobAgeDays?: number | null;
  sourceEscalationLogId?: string;
};
