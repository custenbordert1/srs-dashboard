import type { PaperworkCycleReport } from "@/lib/autonomous-paperwork-orchestrator/types";

export const P125_SOURCE_PHASE = "P125";
export const P125_RUNNER_VERSION = 1 as const;
export const P125_DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
export const P125_STALE_LOCK_MS = 15 * 60 * 1000;
export const P125_STALE_HEARTBEAT_MS = 10 * 60 * 1000;
export const P125_MAX_CONCURRENT_SENDS = 1;

export type ProductionRunnerMode =
  | "manual"
  | "oneCycle"
  | "continuous"
  | "paused"
  | "stopped";

export type ProductionRunnerStatus = "stopped" | "idle" | "running" | "paused";

export type ProductionRunnerLock = {
  runId: string;
  lockedAt: string;
  mode: ProductionRunnerMode;
};

export type ProductionRunnerRetryEntry = {
  candidateId: string;
  candidateName: string;
  error: string;
  attempt: number;
  nextRetryAt: string;
  addedAt: string;
};

export type ProductionRunnerFailureEntry = {
  candidateId: string;
  candidateName: string;
  error: string;
  failedAt: string;
  attempt: number;
};

export type ProductionRunnerDailyMetrics = {
  date: string;
  candidatesProcessed: number;
  successfulSends: number;
  failedSends: number;
  safetyBlocked: number;
  totalProcessingTimeMs: number;
};

export type ProductionRunnerState = {
  version: typeof P125_RUNNER_VERSION;
  runnerStatus: ProductionRunnerStatus;
  schedulerMode: ProductionRunnerMode;
  continuousEnabled: boolean;
  scheduleIntervalMs: number;
  startedAt: string | null;
  lastHeartbeatAt: string | null;
  lastRunAt: string | null;
  lastSuccessfulRunAt: string | null;
  nextScheduledRunAt: string | null;
  processingLock: ProductionRunnerLock | null;
  lastError: string | null;
  lastRunDurationMs: number | null;
  averageProcessingTimeMs: number | null;
  runCount: number;
  sentCandidateIds: string[];
  retryQueue: ProductionRunnerRetryEntry[];
  recentFailures: ProductionRunnerFailureEntry[];
  dailyMetrics: ProductionRunnerDailyMetrics;
  uptimeStartedAt: string | null;
  executeBatchCalled: false;
  updatedAt: string;
};

export type ProductionRunnerMetrics = {
  queueDepth: number;
  candidatesProcessedToday: number;
  successfulSends: number;
  failedSends: number;
  safetyBlocked: number;
  averageProcessingTimeMs: number | null;
  retryQueueDepth: number;
  uptimeMs: number;
};

export type ProductionRunnerSnapshot = {
  sourcePhase: typeof P125_SOURCE_PHASE;
  generatedAt: string;
  sectionTitle: string;
  mode: ProductionRunnerMode;
  status: ProductionRunnerStatus;
  state: ProductionRunnerState;
  metrics: ProductionRunnerMetrics;
  currentCandidate: {
    candidateId: string;
    candidateName: string;
    approvalDecision: string;
    approvalScore: number;
  } | null;
  queue: Array<{
    candidateId: string;
    candidateName: string;
    approvalDecision: string;
    approvalScore: number;
    safeToSend: boolean;
  }>;
  safetyStatus: {
    goNoGo: "GO" | "NO-GO";
    reason: string;
    checks: Array<{ id: string; label: string; passed: boolean; detail: string }>;
  };
  lastCycle: PaperworkCycleReport | null;
  failures: ProductionRunnerFailureEntry[];
  retries: ProductionRunnerRetryEntry[];
  heartbeat: {
    lastAt: string | null;
    stale: boolean;
    healthy: boolean;
  };
  lastExecutionAt: string | null;
  nextExecutionAt: string | null;
  executeBatchCalled: false;
};

export type ProductionRunnerCycleResult = {
  ok: boolean;
  skippedOverlap: boolean;
  skippedPaused: boolean;
  mode: ProductionRunnerMode;
  snapshot: ProductionRunnerSnapshot;
  warnings: string[];
  executeBatchCalled: false;
};
