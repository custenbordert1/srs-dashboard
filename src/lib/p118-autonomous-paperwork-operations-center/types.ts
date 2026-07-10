export const P118_SOURCE_PHASE = "P118";
export const P118_DEFAULT_MODE = "dryRun" as const;

export type PaperworkRunnerOperationalMode = "dryRun" | "live" | "disabled";

export type OperationsAlertType =
  | "runner_failed"
  | "no_run_detected"
  | "live_flag_enabled_without_operator_go"
  | "sudden_spike_blocked"
  | "dropbox_sign_failure"
  | "breezy_sync_failure"
  | "duplicate_risk_spike"
  | "pending_review_backlog"
  | "approved_mapping_not_used"
  | "audit_log_missing";

export type OperationsAlertSeverity = "critical" | "warning" | "info";

export type OperationsAlert = {
  type: OperationsAlertType;
  severity: OperationsAlertSeverity;
  reason: string;
  recommendedAction: string;
  affectedCount: number;
  source: string;
  active: boolean;
};

export type RunnerHealthSummary = {
  currentMode: PaperworkRunnerOperationalMode;
  runnerScheduleEnabled: boolean;
  approvedBridgeDryRunFlag: boolean;
  lastRunAt: string | null;
  lastRunDurationMs: number | null;
  lastRunResult: "success" | "failed" | "never_run";
  lastRunError: string | null;
  candidatesEvaluated: number;
  readyToSend: number;
  sentCount: number;
  skippedCount: number;
  blockedCount: number;
  errorsCount: number;
};

export type SafetyGateStatus = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type QueueDepth = {
  readyToSend: number;
  approvedMappingReady: number;
  pendingMappingReview: number;
  projectNotMappable: number;
  projectMappingReview: number;
  duplicateRisk: number;
  alreadySent: number;
  invalidEmail: number;
  awaitingSignature: number;
  signedToday: number;
  readyForOnboarding: number;
};

export type AutonomousPaperworkOperationsCenterReport = {
  sourcePhase: typeof P118_SOURCE_PHASE;
  generatedAt: string;
  mode: typeof P118_DEFAULT_MODE;
  summary: string;
  goNoGo: "GO" | "NO-GO";
  goNoGoReason: string;
  healthSummary: RunnerHealthSummary;
  safetyStatus: SafetyGateStatus[];
  queueDepth: QueueDepth;
  alerts: OperationsAlert[];
  recommendedActions: string[];
  lastRunSummary: string | null;
  warnings: string[];
};
