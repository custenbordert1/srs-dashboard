export const P1547_SOURCE_PHASE = "P154.7";
export const P1547_RUNNER_VERSION = "P154.7";
export const P1547_DEFAULT_INTERVAL_MINUTES = 10;
export const P1547_DEFAULT_MAX_ASSIGNMENTS = 25;
export const P1547_DEFAULT_MAX_SENDS = 10;
export const P1547_DEFAULT_BACKFILL_LOOKBACK_DAYS = 120;
export const P1547_DEFAULT_MAX_RUNTIME_MINUTES = 30;
export const P1547_STALE_LOCK_MS = 15 * 60 * 1000;

export type P1547RunnerStatus = "stopped" | "idle" | "running" | "paused" | "error";
export type P1547SchedulerMode = "stopped" | "manual" | "continuous" | "paused" | "simulation";

export type P1547ProcessingLock = {
  runId: string;
  lockedAt: string;
  mode: P1547SchedulerMode;
};

export type P1547CycleMetrics = {
  cycleNumber: number;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  candidatesEvaluated: number;
  assigned: number;
  sent: number;
  skipped: number;
  duplicatesPrevented: number;
  errors: number;
  queueRemaining: number;
  dryRun: boolean;
};

export type P1547DailyMetrics = {
  date: string;
  sent: number;
  signaturesCompleted: number;
  assigned: number;
  duplicatesPrevented: number;
  errors: number;
};

export type P1547RunnerState = {
  version: string;
  currentStatus: P1547RunnerStatus;
  schedulerMode: P1547SchedulerMode;
  continuousEnabled: boolean;
  scheduleIntervalMs: number;
  serverStartTime: string | null;
  lastRun: string | null;
  nextRun: string | null;
  lastSuccessfulRun: string | null;
  cycleDurationMs: number | null;
  averageCycleDurationMs: number | null;
  runCount: number;
  processingLock: P1547ProcessingLock | null;
  lastError: string | null;
  candidatesEvaluated: number;
  assigned: number;
  sent: number;
  skipped: number;
  duplicatesPrevented: number;
  errors: number;
  queueRemaining: number;
  dailyMetrics: P1547DailyMetrics;
  recentCycles: P1547CycleMetrics[];
  updatedAt: string;
};

export type P1547AutopilotStatusResponse = {
  ok: boolean;
  runnerStatus: P1547RunnerStatus;
  continuousEnabled: boolean;
  lastCycle: P1547CycleMetrics | null;
  nextCycleAt: string | null;
  currentQueue: number;
  todaysSends: number;
  todaysSignatures: number;
  errors: number;
  uptimeMs: number | null;
  serverStartTime: string | null;
  state: P1547RunnerState;
};

export type P1547CycleReport = {
  sourcePhase: typeof P1547_SOURCE_PHASE;
  generatedAt: string;
  dryRun: boolean;
  skippedOverlap: boolean;
  cycleNumber: number;
  metrics: P1547CycleMetrics;
  ingestion: {
    newCandidates: number;
    mergedIntoStore: number;
    positionsScanned: number;
  };
  controlledCycle: import("@/lib/p154-controlled-production-autopilot-activation/types").ControlledProductionAutopilotCycleReport | null;
  webhookSync: {
    synced: number;
    errors: number;
  } | null;
  stoppedOnError: boolean;
  error: string | null;
};
