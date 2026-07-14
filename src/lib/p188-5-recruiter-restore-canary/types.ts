/** P188.5 — Ten-candidate recruiter ownership restore canary. */

export const P188_5_SOURCE_PHASE = "P188.5" as const;
export const P188_5_SCHEMA_VERSION = 1 as const;
export const P188_5_CANARY_SIZE = 10 as const;
export const P188_5_AUTH_EXPIRATION_HOURS = 4 as const;
export const P188_5_MAX_RECRUITER_WRITES = 10 as const;
export const P188_5_MAX_LEDGER_EVENTS = 10 as const;

export type P1885FrozenCohortMember = {
  candidateId: string;
  proposedRecruiter: string;
  evidenceReference: string;
  sourceTimestamp: string;
  expectedOwnershipVersion: number;
  expectedRecruiter: "Unassigned";
  idempotencyKey: string;
  rollbackReference: string;
  jobResolved: boolean;
  workflowStatus: string;
  bypass: boolean;
};

export type P1885FrozenCohort = {
  cohortId: string;
  fingerprint: string;
  frozenAt: string;
  expiresAt: string;
  size: number;
  members: P1885FrozenCohortMember[];
  immutable: true;
};

export type P1885Authorization = {
  actor: string;
  authorizedAt: string;
  cohortId: string;
  fingerprint: string;
  maxRecruiterWrites: number;
  maxLedgerEvents: number;
  expiresAt: string;
  scope:
    | "ten_candidate_recruiter_ownership_restore_only"
    | "fifty_candidate_recruiter_ownership_restore_only";
};

export type P1885RestoreAttempt = {
  candidateId: string;
  ok: boolean;
  detail: string;
  previousRecruiter: string | null;
  newRecruiter: string | null;
  ledgerEventId: string | null;
  ownershipVersionAfter: number | null;
  lifecycleFieldsChanged: string[];
};
