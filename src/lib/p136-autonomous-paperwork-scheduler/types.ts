export const P136_SOURCE_PHASE = "P136";
export const P136_SCHEDULER_VERSION = 1 as const;
export const P136_DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
export const P136_STALE_LOCK_MS = 15 * 60 * 1000;
export const P136_STALE_HEARTBEAT_MS = 10 * 60 * 1000;

export type SchedulerMode = "manual" | "oneCycle" | "continuous" | "paused" | "stopped";

export type SchedulerStatus = "stopped" | "idle" | "running" | "paused";

export type SchedulerPhase =
  | "refresh_candidate_data"
  | "remediation_executor_preview"
  | "approval_engine"
  | "orchestrator"
  | "build_send_queue"
  | "p122_readiness"
  | "update_ops_command_center"
  | "generate_executive_summary"
  | "sleep";

export type SchedulerLock = {
  runId: string;
  lockedAt: string;
  mode: SchedulerMode;
  currentPhase: SchedulerPhase | null;
};

export type SchedulerCycleMetrics = {
  candidatesEvaluated: number;
  autoApproved: number;
  humanReview: number;
  blocked: number;
  remediationsExecuted: number;
  manualActionsRemaining: number;
  approvalsUnlocked: number;
  queueSize: number;
  readinessCount: number;
  estimatedPaperworkCapacity: number;
};

export type SchedulerState = {
  version: typeof P136_SCHEDULER_VERSION;
  schedulerStatus: SchedulerStatus;
  schedulerMode: SchedulerMode;
  continuousEnabled: boolean;
  scheduleIntervalMs: number;
  startedAt: string | null;
  lastHeartbeatAt: string | null;
  lastCycleAt: string | null;
  lastSuccessfulCycleAt: string | null;
  nextScheduledCycleAt: string | null;
  processingLock: SchedulerLock | null;
  currentPhase: SchedulerPhase | null;
  lastError: string | null;
  lastCycleDurationMs: number | null;
  averageCycleDurationMs: number | null;
  cycleCount: number;
  lastCycleMetrics: SchedulerCycleMetrics | null;
  uptimeStartedAt: string | null;
  executeBatchCalled: false;
  updatedAt: string;
};

export type SchedulerExecutiveSummary = {
  headline: string;
  candidatesEvaluated: number;
  autoApproved: number;
  remediationsCompleted: number;
  approvalsUnlocked: number;
  queueSize: number;
  readinessCount: number;
  safetyStatus: "SAFE_PREVIEW" | "DEGRADED";
  safetyDetail: string;
};

export type SchedulerSafetyStatus = {
  previewOnly: true;
  breezyWrites: false;
  liveModeEnabled: boolean;
  paperworkSent: false;
  executeBatchCalled: false;
  p122Unchanged: true;
  checks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
};

export type SchedulerCycleReport = {
  cycleId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  mode: SchedulerMode;
  phasesCompleted: SchedulerPhase[];
  currentPhase: SchedulerPhase | null;
  metrics: SchedulerCycleMetrics;
  executiveSummary: SchedulerExecutiveSummary;
  safetyStatus: SchedulerSafetyStatus;
  skippedOverlap: boolean;
  skippedPaused: boolean;
  error: string | null;
};

export type AutonomousPaperworkSchedulerReport = {
  sourcePhase: typeof P136_SOURCE_PHASE;
  generatedAt: string;
  mode: "previewOnly";
  state: SchedulerState;
  heartbeat: { lastAt: string | null; stale: boolean; healthy: boolean };
  runtimeMs: number;
  lastCycle: SchedulerCycleReport | null;
  executivePanel: {
    schedulerStatus: SchedulerStatus;
    currentPhase: SchedulerPhase | null;
    lastCycleAt: string | null;
    nextCycleAt: string | null;
    runtimeMs: number;
    heartbeatHealthy: boolean;
    currentQueue: number;
    remediationsCompleted: number;
    estimatedApprovalsUnlocked: number;
    safetyStatus: SchedulerSafetyStatus;
  };
  goNoGo: "GO" | "GO WITH CONDITIONS" | "NO-GO";
  goNoGoReason: string;
  executeBatchCalled: false;
  breezyWrites: false;
  liveModeEnabled: boolean;
  paperworkSent: false;
};
