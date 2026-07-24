/** P188.4 — Recruiter ownership durability + gated restore. */

export const P188_4_SOURCE_PHASE = "P188.4" as const;
export const P188_4_SCHEMA_VERSION = 1 as const;
export const P188_4_RESTORE_BATCH_MAX = 50 as const;
export const P188_4_RESTORE_CANARY_SIZE = 10 as const;

export type P1884OwnershipSource =
  | "manual"
  | "operator_restore"
  | "operator_confirmed_historical_restore"
  | "production_assignment"
  | "internal_assignment"
  | "breezy_import"
  | "auto"
  | "territory_default"
  | "unassigned";

export type P1884ConflictClass =
  | "confirmed_restore"
  | "conflicting_history"
  | "missing_evidence"
  | "current_assignment_protected"
  | "stale_assignment"
  | "unresolved";

export type P1884LedgerEvent = {
  id: string;
  candidateId: string;
  previousRecruiter: string | null;
  newRecruiter: string | null;
  source: P1884OwnershipSource;
  actor: string;
  actorRole: string;
  reason: string;
  at: string;
  correlationId: string;
  idempotencyKey: string;
  workflowVersion: number;
  confidence: number | null;
  evidenceReference: string | null;
  rollbackReference: string | null;
};

export type P1884OwnershipDecision = {
  recruiter: string;
  source: P1884OwnershipSource | null;
  applied: boolean;
  blocked: boolean;
  reason: string;
  conflictClass: P1884ConflictClass | null;
};

export type P1884RestorePreviewItem = {
  candidateId: string;
  redactedCandidateId: string;
  currentRecruiter: string;
  proposedRecruiter: string | null;
  lastNamedAt: string | null;
  sourceEvent: string | null;
  assignmentHistorySummary: string;
  confidence: "high" | "medium" | "low" | "none";
  jobResolved: boolean;
  workflowState: string | null;
  bypass: boolean;
  classification: P1884ConflictClass;
  recommendationReadinessImpact: string;
};

export type P1884OperatorReviewRow = {
  candidateId: string;
  candidateName: string;
  currentRecruiter: string;
  proposedRecruiter: string | null;
  job: string | null;
  state: string | null;
  assignmentEvidence: string | null;
  conflictStatus: P1884ConflictClass;
  recommendedAction: string;
};
