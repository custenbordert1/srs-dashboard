/**
 * P241 — P65.6 Qualification Root Cause Analysis (read-only forensics).
 */

export const P241_PHASE = "P241" as const;
export const P241_EXECUTION_MODE = "read_only" as const;
export const P241_SCHEMA_VERSION = 1 as const;
export const P241_SOURCE_PHASE = "P240" as const;

/** Exact P65.6 canPromoteToPaperworkFunnel check identifiers (ordered). */
export type P241P65CheckId =
  | "funnel_promotion_disabled"
  | "unassigned_recruiter"
  | "missing_email"
  | "terminal_status"
  | "active_packet"
  | "already_signed"
  | "grade_not_allowed"
  | "not_intake_status"
  | "action_type_blocks_promotion";

/** User-facing failed-rule taxonomy. */
export type P241FailedRuleCategory =
  | "questionnaire_incomplete"
  | "operator_approval_required"
  | "missing_required_field"
  | "score_below_threshold"
  | "duplicate_protection"
  | "business_rule"
  | "configuration"
  | "code_path"
  | "other";

export type P241FailureSource =
  | "workflow"
  | "ingestion"
  | "Breezy"
  | "questionnaire"
  | "routing"
  | "recruiter_action"
  | "operator_action"
  | "code_path";

export type P241Classification =
  | "expected_business_rule"
  | "missing_automation"
  | "configuration_issue"
  | "logic_bug"
  | "data_quality_issue";

export type P241Recoverability =
  | "automatic"
  | "operator_review"
  | "recruiter_review"
  | "never";

export type P241GoNoGo = "GO" | "GO_WITH_CONDITIONS" | "NO-GO";

export type P241CheckResult = {
  checkId: P241P65CheckId;
  passed: boolean;
  detail: string;
  ruleCategory: P241FailedRuleCategory;
};

export type P241RuleTrace = {
  context: "current_state" | "p240_replay" | "fixed_replay";
  canPromote: boolean;
  checks: P241CheckResult[];
  firstFailedCheckId: P241P65CheckId | null;
  firstFailedRuleCategory: P241FailedRuleCategory | null;
};

export type P241CandidateForensic = {
  candidateId: string;
  redactedCandidateId: string;
  displayName: string;
  appliedDate: string | null;
  positionId: string | null;
  positionName: string | null;
  assignedRecruiter: string;
  assignedDM: string;
  workflowStage: string;
  breezyStage: string | null;
  paperworkStatus: string;
  signatureRequestIdPresent: boolean;
  actionType: string | null;
  aiGrade: string;
  qualificationStatus: string;
  p240Blocker: string;
  p240BlockerDetail: string;
  currentStateTrace: P241RuleTrace;
  p240ReplayTrace: P241RuleTrace;
  fixedReplayTrace: P241RuleTrace;
  /** Primary failed rule in the P240 dry-run context that produced qualification_gate_failed. */
  failedRule: P241FailedRuleCategory;
  failedCheckId: P241P65CheckId;
  failedCheckDetail: string;
  source: P241FailureSource;
  classification: P241Classification;
  recoverability: P241Recoverability;
  expectedOrUnintended: "expected" | "unintended" | "hybrid";
  rootCause: string;
  smallestSafeCorrection: string | null;
  projectedOutcomeIfRecovered: "would_send" | "would_reach_paperwork_needed" | "still_blocked" | "not_applicable";
  projectedBlockerIfStillBlocked: string | null;
  projectedNearestMiles: number | null;
  projectedCoverageTier: string | null;
};

export type P241RecoveryOpportunity = {
  redactedCandidateId: string;
  displayName: string;
  recoverability: P241Recoverability;
  classification: P241Classification;
  correction: string | null;
  unlocksWouldSend: boolean;
};

export type P241ThroughputSimulation = {
  phase: typeof P241_PHASE;
  generatedAt: string;
  baseline: {
    proxyCohortSize: number;
    wouldSendCount: number;
    blockedCount: number;
    autoClearRatePct: number;
    estimatedDailyThroughputToSent: number;
    healthScore: number;
    goNoGo: P241GoNoGo;
  };
  projectedAfterRecoverableFixes: {
    recoverableQualificationFailures: number;
    wouldSendDelta: number;
    wouldSendCount: number;
    blockedCount: number;
    autoClearRatePct: number;
    estimatedDailyThroughputToSent: number;
    estimatedDailyArrivalRate: number;
    healthScore: number;
    grade: string;
    goNoGo: P241GoNoGo;
    goNoGoReason: string;
    remainingBottlenecks: string[];
  };
  assumptions: string[];
};

export type P241ZeroWriteAudit = {
  phase: typeof P241_PHASE;
  mode: typeof P241_EXECUTION_MODE;
  generatedAt: string;
  before: Record<string, string>;
  after: Record<string, string>;
  unchanged: boolean;
  durablePaths: string[];
  candidateWrites: 0;
  workflowWrites: 0;
  dropboxSignCalls: 0;
  recruiterOwnershipChanges: 0;
  dmAssignmentChanges: 0;
  deployments: 0;
  commits: 0;
};

export type P241ForensicsResult = {
  phase: typeof P241_PHASE;
  schemaVersion: typeof P241_SCHEMA_VERSION;
  mode: typeof P241_EXECUTION_MODE;
  generatedAt: string;
  sourcePhase: typeof P241_SOURCE_PHASE;
  qualificationGateFailedCount: number;
  candidates: P241CandidateForensic[];
  ruleTraceSummary: {
    byFailedCheckId: Record<string, number>;
    byRuleCategory: Record<string, number>;
    byClassification: Record<string, number>;
    byRecoverability: Record<string, number>;
  };
  recoveryOpportunities: P241RecoveryOpportunity[];
  throughputSimulation: P241ThroughputSimulation;
  zeroWriteAudit: P241ZeroWriteAudit;
  testsRun: number;
  testsPassed: number;
  artifactPaths: string[];
};

export const P241_DURABLE_PATHS = [
  ".data/candidate-workflows.json",
  ".data/candidate-ingestion.json",
  ".data/p226-candidate-recovery-store.json",
  ".data/p230-routing-recovery-store.json",
] as const;

export const P241_P65_CHECK_ORDER: P241P65CheckId[] = [
  "funnel_promotion_disabled",
  "unassigned_recruiter",
  "missing_email",
  "terminal_status",
  "active_packet",
  "already_signed",
  "grade_not_allowed",
  "not_intake_status",
  "action_type_blocks_promotion",
];
