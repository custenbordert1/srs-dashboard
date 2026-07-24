/** P186.1 — Shadow-mode lifecycle types. Observes only; never sends paperwork. */

export const P186_1_SOURCE_PHASE = "P186.1" as const;
export const P186_1_SCHEMA_VERSION = 1 as const;

export type P186LifecycleState =
  | "APPLIED"
  | "RECRUITER_REVIEW"
  | "HIRING_RECOMMENDATION"
  | "OPERATOR_APPROVED"
  | "PAPERWORK_NEEDED"
  | "PAPERWORK_SENT"
  | "VIEWED"
  | "SIGNED"
  | "ONBOARDING_COMPLETE"
  | "READY_FOR_MEL"
  | "EXPORTED"
  | "BLOCKED";

export const P186_LIFECYCLE_STATES: readonly P186LifecycleState[] = [
  "APPLIED",
  "RECRUITER_REVIEW",
  "HIRING_RECOMMENDATION",
  "OPERATOR_APPROVED",
  "PAPERWORK_NEEDED",
  "PAPERWORK_SENT",
  "VIEWED",
  "SIGNED",
  "ONBOARDING_COMPLETE",
  "READY_FOR_MEL",
  "EXPORTED",
  "BLOCKED",
] as const;

export const P186_LIFECYCLE_STATE_LABEL: Record<P186LifecycleState, string> = {
  APPLIED: "Applied",
  RECRUITER_REVIEW: "Recruiter Review",
  HIRING_RECOMMENDATION: "Hiring Recommendation",
  OPERATOR_APPROVED: "Operator Approved",
  PAPERWORK_NEEDED: "Paperwork Needed",
  PAPERWORK_SENT: "Paperwork Sent",
  VIEWED: "Viewed",
  SIGNED: "Signed",
  ONBOARDING_COMPLETE: "Onboarding Complete",
  READY_FOR_MEL: "Ready for MEL",
  EXPORTED: "Exported",
  BLOCKED: "Blocked",
};

/** Forward happy-path order (BLOCKED excluded). */
export const P186_HAPPY_PATH_ORDER: readonly P186LifecycleState[] = [
  "APPLIED",
  "RECRUITER_REVIEW",
  "HIRING_RECOMMENDATION",
  "OPERATOR_APPROVED",
  "PAPERWORK_NEEDED",
  "PAPERWORK_SENT",
  "VIEWED",
  "SIGNED",
  "ONBOARDING_COMPLETE",
  "READY_FOR_MEL",
  "EXPORTED",
];

export type P186TransitionSource =
  | "shadow_projection"
  | "production_observe"
  | "reconcile"
  | "manual_test"
  | "audit_replay";

export type P186TransitionActor =
  | "system:shadow"
  | "system:reconcile"
  | "system:test"
  | `user:${string}`
  | `operator:${string}`;

export type P186LifecycleRecord = {
  candidateId: string;
  state: P186LifecycleState;
  previousState: P186LifecycleState | null;
  version: number;
  blockedReason: string | null;
  updatedAt: string;
  correlationId: string | null;
};

export type P186AuditEntry = {
  id: string;
  candidateId: string;
  at: string;
  actor: P186TransitionActor;
  source: P186TransitionSource;
  previousState: P186LifecycleState | null;
  newState: P186LifecycleState;
  reason: string;
  correlationId: string | null;
  accepted: boolean;
  rejectionCode: string | null;
};

export type P186TransitionCommand = {
  candidateId: string;
  toState: P186LifecycleState;
  actor: P186TransitionActor;
  source: P186TransitionSource;
  reason: string;
  correlationId?: string | null;
  eventId?: string | null;
  at?: string;
  /** When true, only validate — never persist. */
  dryValidate?: boolean;
};

export type P186ValidationResult = {
  ok: boolean;
  code:
    | "ok"
    | "illegal_transition"
    | "duplicate_event"
    | "noop_same_state"
    | "impossible_regression"
    | "impossible_transition"
    | "missing_candidate"
    | "cas_conflict"
    | "blocked_without_reason";
  fromState: P186LifecycleState | null;
  toState: P186LifecycleState;
  message: string;
};

export type P186TransitionResult = {
  applied: boolean;
  validation: P186ValidationResult;
  record: P186LifecycleRecord | null;
  auditId: string | null;
};

export type P186ShadowFindingKind =
  | "match"
  | "mismatch"
  | "duplicate_transition"
  | "invalid_transition"
  | "missing_transition"
  | "impossible_transition";

export type P186ShadowFinding = {
  candidateId: string;
  kind: P186ShadowFindingKind;
  productionDerivedState: P186LifecycleState | null;
  shadowState: P186LifecycleState | null;
  detail: string;
  at: string;
};

export type P186ShadowProjectionResult = {
  evaluated: number;
  matches: number;
  mismatches: number;
  duplicateTransitions: number;
  invalidTransitions: number;
  missingTransitions: number;
  impossibleTransitions: number;
  findings: P186ShadowFinding[];
  projectedAt: string;
};

export type P186LifecycleHealthReport = {
  phase: typeof P186_1_SOURCE_PHASE;
  generatedAt: string;
  schemaVersion: number;
  storage: {
    provider: string;
    healthy: boolean;
    durable: boolean;
  };
  countsByState: Record<string, number>;
  auditCount: number;
  shadow: {
    lastProjectedAt: string | null;
    matches: number;
    mismatches: number;
    duplicateTransitions: number;
    invalidTransitions: number;
    missingTransitions: number;
    impossibleTransitions: number;
    matchRate: number | null;
  };
  isolation: {
    paperworkSendDisabled: true;
    continuousAutomationDisabled: true;
    liveModeNotEnabledByP186: true;
    p184P185Unmodified: true;
  };
  readyForP186_2: boolean;
  blockers: string[];
  warnings: string[];
};

/** Minimal production snapshot used by shadow projection (no PII required). */
export type P186ProductionCandidateSnapshot = {
  candidateId: string;
  workflowStatus: string | null;
  paperworkStatus: string | null;
  paperworkSentAt: string | null;
  paperworkViewedAt: string | null;
  paperworkSignedAt: string | null;
  signatureRequestId: string | null;
  recommendedStage: string | null;
  hasOperatorApprovalEvidence?: boolean;
  directDepositStatus?: string | null;
};
