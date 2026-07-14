/** P187.1 — Production canary cohort selection + final authorization readiness (no execution). */

export const P187_1_SOURCE_PHASE = "P187.1" as const;
export const P187_1_SCHEMA_VERSION = 1 as const;

export const P187_1_TRANSITION = "Hiring Recommendation→Operator Approved" as const;
export const P187_1_MAX_COHORT = 5 as const;
export const P187_1_AUTH_EXPIRATION_HOURS = 4 as const;

export type P1871GateResult = {
  gateId: string;
  ok: boolean;
  detail: string;
  critical: boolean;
};

export type P1871PreflightReport = {
  generatedAt: string;
  productionCommit: string;
  aborted: boolean;
  abortReasons: string[];
  gates: P1871GateResult[];
  allCriticalPassed: boolean;
  flagsCurrentlyOff: Record<string, boolean>;
};

/** Read-only candidate observation for eligibility (no mutations). */
export type P1871CandidateObservation = {
  candidateId: string;
  productionRecordVersion: string;
  workflowStatus: string;
  recommendedStage: string | null;
  hasOperatorApprovalEvidence: boolean;
  /** Mapped P186 lifecycle label. */
  lifecycleState: string;
  /** Shadow record present for this candidate. */
  shadowPresent: boolean;
  shadowState: string | null;
  lifecycleMismatch: boolean;
  identityResolved: boolean;
  jobAssignmentResolved: boolean;
  jobAssignmentRef: string | null;
  operatorOwnerResolved: boolean;
  operatorOwner: string | null;
  withdrawn: boolean;
  archived: boolean;
  holdFlags: string[];
  duplicateApprovalEvent: boolean;
  conflictingOperation: boolean;
  staleProductionState: boolean;
  unresolvedAuditIssue: boolean;
  rollbackStateAvailable: boolean;
  recommendationEvidenceRef: string | null;
  lastActionAt: string | null;
  updatedAt: string | null;
};

export type P1871EligibilityResult = {
  candidateId: string;
  eligible: boolean;
  blockedReasons: string[];
  observation: P1871CandidateObservation;
};

export type P1871CohortMemberPreview = {
  redactedCandidateId: string;
  /** Internal id retained only for freeze fingerprinting — never write authority. */
  candidateIdHash: string;
  productionRecordVersion: string;
  currentAuthoritativeState: "Hiring Recommendation";
  p186ExpectedState: "OPERATOR_APPROVED";
  recommendationEvidenceReference: string;
  operatorOwner: string;
  jobAssignment: string;
  idempotencyKey: string;
  auditCorrelationId: string;
  rollbackState: string;
  eligibilityTimestamp: string;
  finalValidationBlockedReasons: string[];
  ready: boolean;
};

export type P1871ImmutableCohortPreview = {
  canaryId: string;
  transition: typeof P187_1_TRANSITION;
  maxCohort: typeof P187_1_MAX_COHORT;
  frozenAt: string;
  cohortFingerprint: string;
  members: P1871CohortMemberPreview[];
  excluded: Array<{ redactedCandidateId: string; reasons: string[] }>;
  replacementsAllowed: false;
  authorityWritten: false;
  approvalsWritten: false;
};

export type P1871WriterContainmentPlan = {
  transition: typeof P187_1_TRANSITION;
  legacyWriter: string;
  p187Writer: string;
  competingWriters: string[];
  schedulerOrApiOverlaps: string[];
  temporaryContainment: string[];
  rollbackReEnablePath: string;
  disabledNow: false;
};

export type P1871DryRunPrediction = {
  canaryId: string;
  cohortFingerprint: string;
  cohortSize: number;
  eligibleCount: number;
  newlyBlockedCount: number;
  duplicateConflicts: number;
  staleStateConflicts: number;
  writerCollisionConflicts: number;
  auditReady: boolean;
  rollbackReady: boolean;
  predictedProductionWrites: number;
  paperworkSendsPredicted: 0;
  melWritesPredicted: 0;
  dryRunOk: boolean;
  stopReason: string | null;
  realProductionWrites: 0;
};

export type P1871AuthorizationPackage = {
  canaryId: string;
  cohortFingerprint: string;
  transitionScope: typeof P187_1_TRANSITION;
  maxCohort: typeof P187_1_MAX_COHORT;
  actor: string | null;
  authorizationTimestamp: string | null;
  expirationWindowHours: typeof P187_1_AUTH_EXPIRATION_HOURS;
  productionCommit: string;
  expectedCandidateCount: number;
  stopConditions: string[];
  rollbackControl: string;
  requiredFeatureFlags: string[];
  requiredRuntimeArgument: string;
  fabricatedApproval: false;
  flagsSet: false;
  operatorApprovalRecorded: false;
};

export type P1871ReadinessVerdict =
  | "ready_for_operator_authorized_canary"
  | "conditionally_ready"
  | "not_ready";
