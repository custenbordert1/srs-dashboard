/** P188.1 — Explicit Recommend Hire + recruiter/job recovery (no auto-approval / paperwork). */

export const P188_1_SOURCE_PHASE = "P188.1" as const;
export const P188_1_SCHEMA_VERSION = 1 as const;
export const P188_1_RECOMMENDED_STAGE = "Hiring Recommendation" as const;
export const P188_1_BULK_MAX = 10 as const;

export type P1881AllowedRole = "recruiter" | "dm" | "operator" | "executive";

export type P1881RecommendationStatus =
  | "recommended"
  | "blocked"
  | "already_recommended"
  | "preview";

export type P1881QueueId =
  | "ready_for_recruiter_review"
  | "ready_to_recommend"
  | "recommendation_blocked"
  | "recruiter_unresolved"
  | "job_unresolved"
  | "hold_conflict"
  | "already_recommended"
  | "already_approved"
  | "paperwork_already_active"
  | "historical_lifecycle_bypass";

export type P1881CandidateContext = {
  candidateId: string;
  workflowExists: boolean;
  workflowStatus: string | null;
  recommendedStage: string | null;
  progressionReason: string | null;
  notes: string[];
  assignedRecruiter: string | null;
  assignedDM: string | null;
  recruiterResolved: boolean;
  recruiterId: string | null;
  jobResolved: boolean;
  jobId: string | null;
  jobLabel: string | null;
  identityResolved: boolean;
  reviewCompleted: boolean;
  holdFlags: string[];
  withdrawn: boolean;
  archived: boolean;
  hasPriorRecommendation: boolean;
  hasPriorOperatorApproval: boolean;
  paperworkActive: boolean;
  paperworkStatus: string | null;
  conflictingOperation: boolean;
  productionRecordVersion: string;
  expectedProductionRecordVersion: string | null;
  stale: boolean;
  updatedAt: string | null;
  lastActionAt: string | null;
};

export type P1881ValidationGate = {
  gateId: string;
  ok: boolean;
  detail: string;
};

export type P1881ValidationResult = {
  ok: boolean;
  eligible: boolean;
  blockers: string[];
  gates: P1881ValidationGate[];
  expectedResultingState: typeof P188_1_RECOMMENDED_STAGE;
  paperworkWillBeSent: false;
  operatorApprovalWillOccur: false;
};

export type P1881RecommendHireInput = {
  candidateId: string;
  actor: string;
  role: P1881AllowedRole;
  reason: string;
  source: "ui" | "api" | "bulk" | "test";
  idempotencyKey?: string;
  expectedProductionRecordVersion?: string | null;
  context: P1881CandidateContext;
};

export type P1881RecommendHireResult = {
  ok: boolean;
  status: P1881RecommendationStatus;
  candidateId: string;
  correlationId: string;
  idempotencyKey: string;
  recommendedStage: typeof P188_1_RECOMMENDED_STAGE | null;
  previousWorkflowStatus: string | null;
  resultingWorkflowStatus: string | null;
  auditId: string | null;
  p186Observed: boolean;
  detail: string;
  blockers: string[];
  paperworkSendsAttempted: 0;
  approvalsAttempted: 0;
  melWritesAttempted: 0;
};

export type P1881AuditRecord = {
  id: string;
  at: string;
  actor: string;
  role: string;
  action: "recommend_hire" | "recommend_hire_blocked" | "recommend_hire_preview";
  candidateId: string;
  previousWorkflowState: string | null;
  resultingWorkflowState: string | null;
  recruiter: string | null;
  job: string | null;
  reason: string;
  source: string;
  correlationId: string;
  idempotencyKey: string;
  validationResults: P1881ValidationGate[];
  ok: boolean;
  detail: string;
};

export type P1881RecruiterRecoveryResult = {
  candidateId: string;
  resolved: boolean;
  recruiter: string | null;
  source:
    | "persisted"
    | "candidate_owner"
    | "breezy_assignee"
    | "territory_dm"
    | "assignment_audit"
    | "operator_confirmed"
    | null;
  ambiguous: boolean;
  candidates: string[];
  detail: string;
};

export type P1881JobRecoveryResult = {
  candidateId: string;
  resolved: boolean;
  jobId: string | null;
  jobLabel: string | null;
  source:
    | "breezy_position_id"
    | "friendly_id"
    | "ingestion_alias"
    | "historical_alias"
    | "unique_title_city_state"
    | "operator_confirmed"
    | null;
  ambiguous: boolean;
  candidates: string[];
  detail: string;
};

export type P1881BypassFinding = {
  candidateId: string;
  previousLikelyState: string;
  reconciledTo: string;
  kind: "midfunnel_bypass";
  detail: string;
  historicalFactOnly: true;
  createdHiringRecommendation: false;
  createdOperatorApproved: false;
  createdPaperworkNeeded: false;
  paperworkSent: boolean;
};

export type P1881QueueItem = {
  queueId: P1881QueueId;
  candidateId: string;
  redactedCandidateId: string;
  recruiter: string | null;
  dm: string | null;
  job: string | null;
  currentState: string | null;
  blockers: string[];
  recommendationReadiness: "ready" | "blocked" | "already_done";
  recommendedOperatorAction: string;
};

export type P1881BulkPreviewResult = {
  ok: boolean;
  previewOnly: true;
  batchSize: number;
  maxBatchSize: typeof P188_1_BULK_MAX;
  eligible: string[];
  blocked: Array<{ candidateId: string; blockers: string[] }>;
  paperworkSendsAttempted: 0;
  executed: false;
};
