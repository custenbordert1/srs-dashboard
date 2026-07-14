/** P191 — Controlled 25-candidate Paperwork Needed + P184 live release. */

export const P191_SOURCE_PHASE = "P191" as const;
export const P191_SCHEMA_VERSION = 1 as const;
export const P191_PILOT_SIZE = 25 as const;
export const P191_AUTH_EXPIRATION_HOURS = 4 as const;
export const P191_MAX_SENDS = 25 as const;

export const P191_REQUIRED_SOURCE_COHORT_ID = "p190-pilot-2a6b078b89" as const;
export const P191_REQUIRED_SOURCE_FINGERPRINT = "11a81d2a561882378aefa019" as const;

export const P191_PAPERWORK_NEEDED_STATUS = "Paperwork Needed" as const;
export const P191_REASON =
  "P191 controlled paperwork release — frozen P190 cohort only; per-candidate temporary P184 live; restore dry_run after each send" as const;

export type P191FrozenCohortMember = {
  candidateId: string;
  recruiter: string;
  jobId: string;
  jobLabel: string | null;
  city: string | null;
  state: string | null;
  currentStage: string;
  recommendedStage: string | null;
  expectedNewStage: typeof P191_PAPERWORK_NEEDED_STATUS;
  expectedOwnershipVersion: number;
  productionRecordVersion: string;
  idempotencyKey: string;
  rollbackReference: string;
  sourceCohortId: typeof P191_REQUIRED_SOURCE_COHORT_ID;
};

export type P191FrozenCohort = {
  cohortId: string;
  fingerprint: string;
  sourceCohortId: typeof P191_REQUIRED_SOURCE_COHORT_ID;
  sourceFingerprint: typeof P191_REQUIRED_SOURCE_FINGERPRINT;
  frozenAt: string;
  expiresAt: string;
  size: number;
  immutable: true;
  members: P191FrozenCohortMember[];
  sourcePhase: typeof P191_SOURCE_PHASE;
  schemaVersion: typeof P191_SCHEMA_VERSION;
};

export type P191Authorization = {
  cohortId: string;
  fingerprint: string;
  authorizedAt: string;
  expiresAt: string;
  maxSends: typeof P191_MAX_SENDS;
  authorizedBy: string;
  authorizationToken: string;
  allowContinuousAutomation: false;
  allowScheduler: false;
  allowP187: false;
  allowMel: false;
  allowOutsideCohort: false;
};

export type P191SendAttempt = {
  candidateId: string;
  ok: boolean;
  status: string;
  correlationId: string | null;
  idempotencyKey: string;
  auditId: string | null;
  p186Observed: boolean;
  previousWorkflowStatus: string | null;
  resultingWorkflowStatus: string | null;
  envelopeId: string | null;
  confirmedSent: boolean;
  recruiterPreserved: boolean;
  paperworkNeededCreated: boolean;
  dropboxSignSends: number;
  melExports: 0;
  detail: string;
  blockers: string[];
  p184ModeAfterCandidate: "dry_run" | "live" | "unknown";
};

export type P191ExecutionResult = {
  cohortId: string;
  fingerprint: string;
  attempted: number;
  successful: number;
  failed: number;
  confirmedDropboxSignSends: number;
  duplicateEnvelopes: number;
  auditEvents: number;
  p186Observations: number;
  finalP184Mode: "dry_run" | "live" | "unknown";
  automationStatus: "off" | "on";
  queueRemaining: number;
  viewed: number;
  signed: number;
  failedEnvelopes: number;
  stoppedEarly: boolean;
  stopReason: string | null;
  attempts: P191SendAttempt[];
  melExports: 0;
};
