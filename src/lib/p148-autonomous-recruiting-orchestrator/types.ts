export const P148_SOURCE_PHASE = "P148";
export const P148_ORCHESTRATOR_VERSION = 1 as const;
export const P148_DEFAULT_INTERVAL_MINUTES = 5;
export const P148_DEFAULT_MAX_RUNTIME_SECONDS = 120;
export const P148_STALE_LOCK_MS = (P148_DEFAULT_MAX_RUNTIME_SECONDS + 30) * 1000;
export const P148_MAX_RUN_HISTORY = 100;

export type OrchestratorPhase =
  | "refresh_live_snapshot"
  | "candidate_intelligence"
  | "build_paperwork_queue"
  | "auto_reminder_processing"
  | "initial_paperwork_processing"
  | "generate_executive_metrics"
  | "persist_run_summary";

export type OrchestratorStatus = "stopped" | "idle" | "running";

export type OrchestratorLock = {
  runId: string;
  lockedAt: string;
  dryRun: boolean;
  currentPhase: OrchestratorPhase | null;
};

export type PhaseTiming = {
  phase: OrchestratorPhase;
  success: boolean;
  durationMs: number;
  error?: string;
  recoveryAction?: string;
  cacheHit?: boolean;
};

export type OrchestratorObservability = {
  phaseTimings: PhaseTiming[];
  cacheHitRate: number;
  apiLatencyMs: number;
  executionCount: number;
  skippedRuns: number;
};

export type OrchestratorAlert = {
  id: string;
  severity: "warning" | "critical";
  message: string;
  detail: string;
};

export type AutonomousRecruitingCycleResult = {
  runId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  candidatesEvaluated: number;
  paperworkQueueCount: number;
  remindersSent: number;
  initialPaperworkSent: number;
  blockedCandidates: number;
  failures: string[];
  warnings: string[];
  success: boolean;
  dryRun: boolean;
  skipped?: boolean;
  skipReason?: string;
  phaseTimings: PhaseTiming[];
  observability: OrchestratorObservability;
  alerts: OrchestratorAlert[];
  breezyWrites: false;
  executeBatchCalled: false;
  paperworkSent: boolean;
};

export type OrchestratorRunRecord = AutonomousRecruitingCycleResult & {
  sourcePhase: typeof P148_SOURCE_PHASE;
};

export type OrchestratorState = {
  version: typeof P148_ORCHESTRATOR_VERSION;
  orchestratorStatus: OrchestratorStatus;
  enabled: boolean;
  scheduleIntervalMinutes: number;
  maxRuntimeSeconds: number;
  lastRunAt: string | null;
  lastSuccessfulRunAt: string | null;
  nextScheduledRunAt: string | null;
  processingLock: OrchestratorLock | null;
  currentPhase: OrchestratorPhase | null;
  lastError: string | null;
  lastRunDurationMs: number | null;
  averageRunDurationMs: number | null;
  runCount: number;
  skippedRunCount: number;
  lastCycleResult: AutonomousRecruitingCycleResult | null;
  executeBatchCalled: false;
  updatedAt: string;
};

export type OrchestratorStatusSnapshot = {
  sourcePhase: typeof P148_SOURCE_PHASE;
  generatedAt: string;
  automationStatus: OrchestratorStatus;
  enabled: boolean;
  dryRunOnly: boolean;
  lastSuccessfulRun: string | null;
  currentRun: OrchestratorLock | null;
  lastRunDurationMs: number | null;
  candidatesEvaluated: number;
  paperworkQueueCount: number;
  remindersSent: number;
  initialPaperworkSent: number;
  blockedCandidates: number;
  failures: string[];
  warnings: string[];
  nextScheduledRun: string | null;
  scheduleIntervalMinutes: number;
  alerts: OrchestratorAlert[];
  observability: OrchestratorObservability | null;
  breezyWrites: false;
  executeBatchCalled: false;
};
