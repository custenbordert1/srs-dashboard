import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";

export type RecruiterActionType =
  | "assign-recruiter"
  | "screen-candidate"
  | "needs-review"
  | "schedule-interview"
  | "send-paperwork"
  | "await-signature"
  | "follow-up"
  | "verify-paperwork"
  | "await-dd"
  | "load-mel"
  | "training"
  | "monitor"
  | "none";

export type RecruiterActionPriority = "high" | "medium" | "low";

export const RECRUITER_ACTION_LABELS: Record<RecruiterActionType, string> = {
  "assign-recruiter": "Assign Recruiter",
  "screen-candidate": "Screen Candidate",
  "needs-review": "Needs Review",
  "schedule-interview": "Schedule Interview",
  "send-paperwork": "Send Paperwork",
  "await-signature": "Await Signature",
  "follow-up": "Follow Up",
  "verify-paperwork": "Verify Paperwork",
  "await-dd": "Await Direct Deposit",
  "load-mel": "Load into MEL",
  training: "Schedule Training",
  monitor: "Monitor Rep",
  none: "No Action",
};

export type RecruiterActionDecision = {
  candidateId: string;
  requiredAction: string;
  actionType: RecruiterActionType;
  actionPriority: RecruiterActionPriority;
  actionReason: string;
  /** ISO date (YYYY-MM-DD) when the action should be completed. */
  actionDueDate: string;
  actionConfidence: number;
  shouldPersist: boolean;
};

export type RecruiterActionEngineInput = {
  candidates: ScoredCandidateWorkflowRow[];
  referenceMs?: number;
};

export type RecruiterActionMetrics = {
  overdueRecruiterActions: number;
  actionsDueToday: number;
  averageActionAgeDays: number;
  recruiterSlaCompliance: number;
  totalWithActions: number;
  highPriorityCount: number;
};

export type RecruiterActionEngineResult = {
  decisions: RecruiterActionDecision[];
  generated: number;
  skipped: number;
  metrics: RecruiterActionMetrics;
};
