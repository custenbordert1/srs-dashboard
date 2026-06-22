import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";

export type AutomationType =
  | "send-paperwork"
  | "follow-up-paperwork"
  | "mark-ready-for-mel"
  | "close-pause-ad"
  | "create-new-ad"
  | "refresh-ad"
  | "escalate-recruiter-task";

export type AutomationRunStatus =
  | "pending"
  | "approved"
  | "executed"
  | "failed"
  | "rejected"
  | "cancelled";

export type ApplicantReviewVerdict = "qualified" | "needs-review" | "disqualified" | "incomplete";

export type ApplicantReviewResult = {
  candidateId: string;
  verdict: ApplicantReviewVerdict;
  grade: string;
  confidence: string;
  qualified: boolean;
  missingItems: string[];
  unknownItems: string[];
  strengths: string[];
  concerns: string[];
  summary: string;
};

export type NextStepRecommendation = {
  action: AutomationType | "none";
  reason: string;
  dataUsed: string[];
  expectedOutcome: string;
  requiresApproval: boolean;
  undoPath: string;
};

export type AutomationRun = {
  id: string;
  type: AutomationType;
  status: AutomationRunStatus;
  candidateId?: string;
  positionId?: string;
  breezyJobId?: string;
  reason: string;
  dataUsed: string[];
  expectedOutcome: string;
  undoPath: string;
  requiresApproval: boolean;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  executedAt?: string;
  executedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  failureReason?: string;
  resultSummary?: string;
  auditTrail: AutomationAuditEntry[];
  payload?: Record<string, string>;
};

export type AutomationAuditEntry = {
  id: string;
  at: string;
  action: string;
  actor?: string;
  detail: string;
};

export type AdActionRecommendation = {
  type: "close-pause-ad" | "create-new-ad" | "refresh-ad";
  breezyJobId?: string;
  positionId?: string;
  title: string;
  reason: string;
  dataUsed: string[];
  expectedOutcome: string;
  requiresApproval: true;
  suggestedCity?: string;
  suggestedTitle?: string;
  suggestedPriority?: "high" | "medium" | "low";
  nearbyLocations?: string[];
};

export type ControlCenterSnapshot = {
  pending: AutomationRun[];
  approved: AutomationRun[];
  executed: AutomationRun[];
  failed: AutomationRun[];
  rejected: AutomationRun[];
  generatedAt: string;
};

export type PlanAutomationInput = {
  candidates: ScoredCandidateWorkflowRow[];
  referenceMs?: number;
};

export const AUTOMATION_TYPE_LABELS: Record<AutomationType, string> = {
  "send-paperwork": "Send paperwork",
  "follow-up-paperwork": "Follow up on paperwork",
  "mark-ready-for-mel": "Mark Ready for MEL",
  "close-pause-ad": "Close or pause ad",
  "create-new-ad": "Create new ad",
  "refresh-ad": "Refresh ad",
  "escalate-recruiter-task": "Escalate recruiter task",
};
