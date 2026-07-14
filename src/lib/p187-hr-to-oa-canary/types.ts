/** P187 — Controlled production lifecycle cutover canary (Hiring Recommendation → Operator Approved). */

export const P187_SOURCE_PHASE = "P187" as const;
export const P187_SCHEMA_VERSION = 1 as const;

export const P187_CANARY_TRANSITION = "Hiring Recommendation→Operator Approved" as const;
export const P187_FROM_STATE = "HIRING_RECOMMENDATION" as const;
export const P187_TO_STATE = "OPERATOR_APPROVED" as const;

export const P187_MAX_COHORT = 5 as const;

export const P187_LEGACY_OWNER = "p97-approval-mode-persist / api-candidates-workflows" as const;
export const P187_P186_OWNER =
  "p187-hr-to-oa-canary→p186-lifecycle-control-plane→candidate-workflow-store-core" as const;

export type P187CanaryStatus =
  | "planned"
  | "authorized"
  | "dry_run_complete"
  | "running"
  | "stopped_on_failure"
  | "completed"
  | "rolled_back"
  | "refused";

export type P187CandidateSnapshot = {
  candidateId: string;
  /** Production workflow status before canary. */
  productionBefore: string;
  /** Mapped P186 lifecycle state before. */
  lifecycleBefore: string;
  /** Expected after successful canary. */
  expectedLifecycleAfter: typeof P187_TO_STATE;
  /** Must remain at or before Operator Approved — never Paperwork Needed+. */
  maxAllowedProductionAfter: string[];
};

export type P187CandidateResult = {
  candidateId: string;
  ok: boolean;
  productionBefore: string;
  productionAfter: string | null;
  lifecycleBefore: string;
  lifecycleAfter: string | null;
  p186Expected: typeof P187_TO_STATE;
  mismatch: boolean;
  duplicateTransition: boolean;
  skippedTransition: boolean;
  invalidStateChange: boolean;
  auditId: string | null;
  detail: string;
};

export type P187OperatorAuthorization = {
  authorized: boolean;
  actor: string;
  approvedAt: string;
  reason: string;
  cohortFingerprint: string;
};

export type P187CanaryPlan = {
  transition: typeof P187_CANARY_TRANSITION;
  cohortIds: readonly string[];
  immutable: true;
  maxCohortSize: typeof P187_MAX_COHORT;
  stopOnFirstFailure: true;
  legacyOwner: typeof P187_LEGACY_OWNER;
  p186Owner: typeof P187_P186_OWNER;
  executed: false;
  status: P187CanaryStatus;
  authorization: P187OperatorAuthorization | null;
};

export type P187ReconciliationFinding = {
  kind:
    | "match"
    | "mismatch"
    | "duplicate_transition"
    | "skipped_transition"
    | "invalid_state_change"
    | "audit_gap";
  candidateId: string;
  detail: string;
  severity: "info" | "warning" | "critical";
};

export type P187ReconciliationReport = {
  generatedAt: string;
  candidatesEvaluated: number;
  candidatesTransitioned: number;
  matches: number;
  mismatches: number;
  duplicateTransitions: number;
  skippedTransitions: number;
  invalidStateChanges: number;
  auditGaps: number;
  findings: P187ReconciliationFinding[];
  successRate: number;
};

export type P187RollbackResult = {
  ok: boolean;
  executed: boolean;
  restoredLegacyOwnership: boolean;
  auditPreserved: true;
  dataLoss: false;
  duplicateWorkflowEntries: false;
  paperworkSends: 0;
  melExports: 0;
  candidatesRestored: string[];
  detail: string;
};

export type P187CutoverDashboard = {
  sourcePhase: typeof P187_SOURCE_PHASE;
  generatedAt: string;
  transition: typeof P187_CANARY_TRANSITION;
  candidatesEvaluated: number;
  candidatesTransitioned: number;
  successRate: number;
  rollbackReadiness: boolean;
  legacyOwner: typeof P187_LEGACY_OWNER;
  p186Owner: typeof P187_P186_OWNER;
  mismatches: number;
  stopReason: string | null;
  auditStatus: "complete" | "gaps" | "not_started";
  canaryStatus: P187CanaryStatus;
  productionExecutionEnabled: false | true;
  safety: {
    paperworkSendsAttempted: 0;
    dropboxSignChanges: 0;
    melExportsAttempted: 0;
    advancedBeyondOperatorApproved: 0;
    continuousAutomationEnabled: false;
    schedulerChanged: false;
    otherTransitionsCutover: false;
    productionCanaryExecuted: false;
  };
};

export type P187AuditEntry = {
  id: string;
  at: string;
  actor: string;
  action:
    | "plan_created"
    | "authorized"
    | "dry_run"
    | "transition_attempt"
    | "transition_success"
    | "transition_failure"
    | "stop_on_failure"
    | "rollback"
    | "refused_execution";
  candidateId?: string;
  detail: string;
  preserved: true;
};
