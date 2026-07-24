import type {
  P240BlockerCode,
  P240CandidateTrace,
  P240GoNoGo,
  P240PipelineHealth,
  P240Throughput,
  P240ZeroWriteAudit,
} from "@/lib/p240-autonomous-new-applicant-pipeline/types";

export const P242_PHASE = "P242" as const;
export const P242_SCHEMA_VERSION = 1 as const;
export const P242_EXECUTION_MODE = "read_only_dry_run" as const;
export const P242_SOURCE_PHASE = "P241" as const;

export const P242_DURABLE_PATHS = [
  ".data/candidate-workflows.json",
  ".data/candidate-ingestion.json",
  ".data/p226-candidate-recovery-store.json",
  ".data/p230-routing-recovery-store.json",
] as const;

export const P242_EXPECTED = {
  wouldSendCount: 13,
  proxyCohortSize: 17,
  autoClearRatePct: 76.5,
  estimatedDailyThroughputToSent: 13.3,
  healthScore: 83,
  goNoGo: "GO_WITH_CONDITIONS" as const,
  remainingBlockers: ["manual_review_40_60", "duplicate_identity", "missing_phone"] as const,
  p241RecoverableCount: 8,
} as const;

export const P242_BASELINE_P240 = {
  wouldSendCount: 5,
  blockedCount: 12,
  autoClearRatePct: 29.4,
  estimatedDailyThroughputToSent: 5.1,
  healthScore: 66,
  goNoGo: "NO-GO" as const,
  qualificationGateFailed: 8,
} as const;

export type P242DispositionKind =
  | "would_send"
  | "manual_review"
  | "duplicate_identity"
  | "missing_phone"
  | "qualification_gate_failed"
  | "other_blocked"
  | "protected_skip"
  | "would_reach_paperwork_needed";

export type P242CandidateDisposition = {
  candidateId: string;
  redactedCandidateId: string;
  displayName: string;
  appliedDate: string | null;
  currentStage: string;
  paperworkStatus: string;
  actionTypeBeforeReplay: string | null;
  disposition: P242DispositionKind;
  outcome: P240CandidateTrace["outcome"];
  blocker: P240BlockerCode | null;
  blockerDetail: string | null;
  nearestMiles: number | null;
  coverageTier: string | null;
  wasP241QualificationFailure: boolean;
  actionTypeBlocksCleared: boolean;
};

export type P242LiveProtectionCase = {
  caseId: string;
  description: string;
  passed: boolean;
  detail: string;
};

export type P242P241CaseValidation = {
  redactedCandidateId: string;
  displayName: string;
  actionTypeBefore: string | null;
  actionTypeBlocksPromotionCleared: boolean;
  disposition: P242DispositionKind;
  outcome: string;
  blocker: string | null;
  unlocksWouldSend: boolean;
};

export type P242CorrectedThroughput = {
  phase: typeof P242_PHASE;
  generatedAt: string;
  baselineP240: typeof P242_BASELINE_P240;
  corrected: {
    proxyCohortSize: number;
    wouldSendCount: number;
    blockedCount: number;
    autoClearRatePct: number;
    estimatedDailyArrivalRate: number;
    estimatedDailyThroughputToSent: number;
    healthScore: number;
    grade: string;
    goNoGo: P240GoNoGo | "GO_WITH_CONDITIONS";
    goNoGoReason: string;
    bottleneckBreakdown: Array<{ blocker: string; count: number; pct: number }>;
  };
  expectedFromP241: typeof P242_EXPECTED;
  matchesExpected: boolean;
  variances: string[];
  throughput: P240Throughput;
  health: P240PipelineHealth;
};

export type P242ZeroWriteAudit = P240ZeroWriteAudit & {
  phase: typeof P242_PHASE;
  mode: typeof P242_EXECUTION_MODE;
  candidateWrites: 0;
  workflowWrites: 0;
  dropboxSignCalls: 0;
  recruiterOwnershipChanges: 0;
  dmAssignmentChanges: 0;
  deployments: 0;
  commits: 0;
  liveSends: 0;
};

export type P242ValidationResult = {
  phase: typeof P242_PHASE;
  generatedAt: string;
  dispositions: P242CandidateDisposition[];
  dispositionSummary: Record<P242DispositionKind, number>;
  p241CaseValidations: P242P241CaseValidation[];
  liveProtection: P242LiveProtectionCase[];
  correctedThroughput: P242CorrectedThroughput;
  zeroWriteAudit: P242ZeroWriteAudit;
  clearedActionFields: readonly string[];
  testsRun: number;
  testsPassed: number;
};
