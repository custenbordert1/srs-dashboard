/** P190 — Controlled 25-candidate Operator Approval production pilot. */

export const P190_SOURCE_PHASE = "P190" as const;
export const P190_SCHEMA_VERSION = 1 as const;
export const P190_PILOT_SIZE = 25 as const;
export const P190_AUTH_EXPIRATION_HOURS = 4 as const;
export const P190_MAX_APPROVAL_WRITES = 25 as const;

export const P190_REQUIRED_SOURCE_COHORT_ID = "p189-pilot-8e35d667e5" as const;
export const P190_REQUIRED_SOURCE_FINGERPRINT = "11a81d2a561882378aefa019" as const;

export const P190_OPERATOR_APPROVED_STATUS = "Operator Approved" as const;
export const P190_REASON =
  "P190 controlled Operator Approval pilot — authorized for frozen P189 cohort only; no paperwork/P184/P187/MEL" as const;

export type P190FrozenCohortMember = {
  candidateId: string;
  recruiter: string;
  jobId: string;
  jobLabel: string | null;
  city: string | null;
  state: string | null;
  currentStage: string;
  recommendedStage: string | null;
  expectedNewStage: typeof P190_OPERATOR_APPROVED_STATUS;
  expectedOwnershipVersion: number;
  productionRecordVersion: string;
  idempotencyKey: string;
  rollbackReference: string;
  sourceCohortId: typeof P190_REQUIRED_SOURCE_COHORT_ID;
};

export type P190FrozenCohort = {
  cohortId: string;
  fingerprint: string;
  sourceCohortId: typeof P190_REQUIRED_SOURCE_COHORT_ID;
  sourceFingerprint: typeof P190_REQUIRED_SOURCE_FINGERPRINT;
  frozenAt: string;
  expiresAt: string;
  size: number;
  immutable: true;
  members: P190FrozenCohortMember[];
  sourcePhase: typeof P190_SOURCE_PHASE;
  schemaVersion: typeof P190_SCHEMA_VERSION;
};

export type P190Authorization = {
  cohortId: string;
  fingerprint: string;
  authorizedAt: string;
  expiresAt: string;
  maxWrites: typeof P190_MAX_APPROVAL_WRITES;
  authorizedBy: string;
  authorizationToken: string;
  allowPaperwork: false;
  allowP184: false;
  allowP187: false;
  allowAutomation: false;
  allowMel: false;
  allowDropboxSign: false;
};

export type P190ApprovalAttempt = {
  candidateId: string;
  ok: boolean;
  status: string;
  correlationId: string | null;
  idempotencyKey: string;
  auditId: string | null;
  p186Observed: boolean;
  previousWorkflowStatus: string | null;
  resultingWorkflowStatus: string | null;
  recommendedStagePreserved: boolean;
  recruiterPreserved: boolean;
  paperworkCreated: false;
  dropboxSignSends: 0;
  melExports: 0;
  detail: string;
  blockers: string[];
};

export type P190ExecutionResult = {
  cohortId: string;
  fingerprint: string;
  attempted: number;
  successful: number;
  failed: number;
  auditEvents: number;
  p186Observations: number;
  duplicateApprovals: number;
  paperworkCreated: 0;
  dropboxSignSends: 0;
  melExports: 0;
  stoppedEarly: boolean;
  stopReason: string | null;
  attempts: P190ApprovalAttempt[];
};
