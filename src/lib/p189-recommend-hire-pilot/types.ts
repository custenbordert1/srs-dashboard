/** P189 — Controlled 25-candidate Recommend Hire production pilot. */

export const P189_SOURCE_PHASE = "P189" as const;
export const P189_SCHEMA_VERSION = 1 as const;
export const P189_PILOT_SIZE = 25 as const;
export const P189_AUTH_EXPIRATION_HOURS = 4 as const;
export const P189_MAX_RECOMMEND_HIRE_WRITES = 25 as const;
export const P189_REASON =
  "P189 controlled Recommend Hire pilot — operator-authorized batch; no OA/paperwork/MEL" as const;

export type P189FrozenCohortMember = {
  candidateId: string;
  recruiter: string;
  jobId: string;
  jobLabel: string | null;
  city: string | null;
  state: string | null;
  currentStage: string;
  expectedNewStage: "Hiring Recommendation";
  productionRecordVersion: string;
  expectedOwnershipVersion: number;
  idempotencyKey: string;
  rollbackReference: string;
};

export type P189FrozenCohort = {
  cohortId: string;
  fingerprint: string;
  frozenAt: string;
  expiresAt: string;
  size: number;
  immutable: true;
  members: P189FrozenCohortMember[];
  sourcePhase: typeof P189_SOURCE_PHASE;
  schemaVersion: typeof P189_SCHEMA_VERSION;
};

export type P189Authorization = {
  cohortId: string;
  fingerprint: string;
  authorizedAt: string;
  expiresAt: string;
  maxWrites: typeof P189_MAX_RECOMMEND_HIRE_WRITES;
  authorizedBy: string;
  authorizationToken: string;
  allowOperatorApproval: false;
  allowPaperwork: false;
  allowP187: false;
  allowAutomation: false;
  allowMel: false;
};

export type P189PreviewRow = {
  candidateId: string;
  recruiter: string;
  job: string;
  cityState: string;
  currentStage: string;
  expectedNewStage: "Hiring Recommendation";
  recommendationReason: string;
  blockers: string[];
  auditPreview: string;
  eligible: boolean;
};

export type P189RecommendAttempt = {
  candidateId: string;
  ok: boolean;
  status: string;
  correlationId: string | null;
  idempotencyKey: string;
  auditId: string | null;
  p186Observed: boolean;
  previousStage: string | null;
  resultingStage: string | null;
  recommendedStage: string | null;
  recruiterPreserved: boolean;
  detail: string;
  blockers: string[];
};

export type P189ExecutionResult = {
  cohortId: string;
  fingerprint: string;
  attempted: number;
  successful: number;
  failed: number;
  auditEvents: number;
  p186Observations: number;
  duplicateRecommendations: number;
  staleConflicts: number;
  stoppedEarly: boolean;
  stopReason: string | null;
  attempts: P189RecommendAttempt[];
  approvalsCreated: 0;
  paperworkCreated: 0;
  paperworkSendsAttempted: 0;
  melWritesAttempted: 0;
  operatorApprovalsAttempted: 0;
};
