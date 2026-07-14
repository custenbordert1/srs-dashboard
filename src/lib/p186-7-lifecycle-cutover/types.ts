/** P186.7 — Controlled lifecycle cutover + legacy writer retirement (plan/readiness only). */

export const P186_7_SOURCE_PHASE = "P186.7" as const;
export const P186_7_SCHEMA_VERSION = 7 as const;

/** P186.7 must stop before Stage 2 unless explicitly authorized. */
export type P1867CutoverStage =
  | "stage_0_shadow_only"
  | "stage_1_read_only_enablement"
  | "stage_2_single_transition_canary"
  | "stage_3_limited_lifecycle_authority"
  | "stage_4_full_lifecycle_authority"
  | "stage_5_retirement";

export const P1867_IMPLEMENTED_MAX_STAGE: P1867CutoverStage = "stage_1_read_only_enablement";

export type P1867WriterControlStatus =
  | "active"
  | "shadow_observe"
  | "freeze_pending"
  | "frozen"
  | "deprecated"
  | "rollback_enabled"
  | "retired";

export type P1867LifecycleTransition =
  | "Applied→Recruiter Review"
  | "Recruiter Review→Hiring Recommendation"
  | "Hiring Recommendation→Operator Approved"
  | "Operator Approved→Paperwork Needed"
  | "Paperwork Needed→Paperwork Sent"
  | "Paperwork Sent→Viewed"
  | "Viewed→Signed"
  | "Signed→Onboarding Complete"
  | "Onboarding Complete→Ready for MEL"
  | "Ready for MEL→MEL Export Review"
  | "MEL Export Review→Exported";

export const P1867_TRANSITIONS: readonly P1867LifecycleTransition[] = [
  "Applied→Recruiter Review",
  "Recruiter Review→Hiring Recommendation",
  "Hiring Recommendation→Operator Approved",
  "Operator Approved→Paperwork Needed",
  "Paperwork Needed→Paperwork Sent",
  "Paperwork Sent→Viewed",
  "Viewed→Signed",
  "Signed→Onboarding Complete",
  "Onboarding Complete→Ready for MEL",
  "Ready for MEL→MEL Export Review",
  "MEL Export Review→Exported",
] as const;

export type P1867OwnershipRow = {
  transition: P1867LifecycleTransition;
  futureAuthoritativeWriter: string;
  competingWriters: string[];
  productionAdapter: string;
  operatorApprovalRequired: boolean;
  idempotencyRule: string;
  auditRequirement: string;
  rollbackWriter: string;
  migrationStatus: "planned" | "shadow_observe" | "canary_ready" | "blocked";
  p184P185Preserved: boolean;
};

export type P1867WriterControlRecord = {
  writerId: string;
  module: string;
  transitionsOwned: string[];
  currentStatus: P1867WriterControlStatus;
  desiredStatus: P1867WriterControlStatus;
  featureFlag: string | null;
  dependency: string | null;
  replacementWriter: string;
  freezeOrder: number | null;
  disabledTimestamp: string | null;
  rollbackStatus: "ready" | "untested" | "n/a";
  lastObservedWrite: string | null;
  healthStatus: "healthy" | "degraded" | "unknown";
  freezeBlockedReasons: string[];
  neverFreeze?: boolean;
};

export type P1867GateResult = {
  gateId: string;
  ok: boolean;
  detail: string;
};

export type P1867ShadowParityReport = {
  candidatesEvaluated: number;
  matches: number;
  mismatches: number;
  missingShadowRecords: number;
  impossibleTransitions: number;
  staleEvents: number;
  duplicateWriterEvents: number;
  sourceLagMs: number | null;
  auditGaps: number;
  ownershipConflicts: number;
  matchRate: number;
  criticalMismatches: number;
};

export type P1867CanaryPlan = {
  transition: P1867LifecycleTransition;
  cohortIds: string[];
  immutable: true;
  maxCohortSize: number;
  stopOnFirstFailure: true;
  executed: false;
  rollbackAction: string;
};

export type P1867RollbackPlan = {
  transitionGroup: string;
  rollbackTrigger: string;
  rollbackFlag: string;
  previousAuthoritativeWriter: string;
  stateReconstruction: string;
  pendingOperationRecovery: string;
  auditPreservation: string;
  queuePreservation: string;
  operatorNotification: string;
  verificationSteps: string[];
  forbids: string[];
};

export type P1867RetirementItem = {
  item: string;
  path: string;
  replacement: string;
  dependencyCheck: string;
  safeRemovalPhase: string;
  rollbackRequirement: string;
  deletedNow: false;
};
