export const P106_1_SOURCE_PHASE = "P106.1";
export const P106_1_RUNNER_VERSION = 1;
export const P106_1_DEFAULT_MODE = "dryRun" as const;
export const P106_1_DEV_INTERVAL_MS = 5 * 60 * 1000;
export const P106_1_STALE_LOCK_MS = 15 * 60 * 1000;

export type AutonomousPaperworkRunnerMode =
  | "dryRun"
  | "runOnce"
  | "scheduled"
  | "fullReconciliation";

export type AutonomousPaperworkRunnerStatus = "stopped" | "running" | "idle";

export type AutonomousPaperworkRunnerLock = {
  runId: string;
  lockedAt: string;
  mode: AutonomousPaperworkRunnerMode;
};

export type AutonomousPaperworkBlockedRecord = {
  candidateId: string;
  candidateName: string;
  blockerCategory: string;
  blockerReason: string;
  recommendedFix: string | null;
  lastEvaluatedAt: string;
};

export type AutonomousPaperworkRunnerState = {
  version: typeof P106_1_RUNNER_VERSION;
  runnerStatus: AutonomousPaperworkRunnerStatus;
  scheduleEnabled: boolean;
  scheduleIntervalMs: number;
  lastRunAt: string | null;
  lastSuccessfulRunAt: string | null;
  lastProcessedCheckpoint: string | null;
  processingLock: AutonomousPaperworkRunnerLock | null;
  lastError: string | null;
  lastRunDurationMs: number | null;
  averageRunDurationMs: number | null;
  runCount: number;
  blockedRegistry: Record<string, AutonomousPaperworkBlockedRecord>;
  updatedAt: string;
};

export type AutonomousPaperworkRunnerCycleMetrics = {
  candidatesEvaluated: number;
  newCandidates: number;
  candidatesSent: number;
  skippedAlreadySent: number;
  blocked: number;
  blockedInvalidEmail: number;
  blockedDuplicate: number;
  blockedUnpublishedJob: number;
  blockedClosedJob: number;
  blockedManualReview: number;
  autoRepaired: number;
  breezySyncOk: boolean;
};

export type AutonomousPaperworkRunnerReport = {
  sourcePhase: typeof P106_1_SOURCE_PHASE;
  generatedAt: string;
  sectionTitle: string;
  mode: AutonomousPaperworkRunnerMode;
  state: AutonomousPaperworkRunnerState;
  metrics: AutonomousPaperworkRunnerCycleMetrics;
  currentQueue: Array<{
    candidateId: string;
    candidateName: string;
    category: string;
    blockerReason: string | null;
  }>;
  lastCycleCandidates: import("@/lib/p106-autonomous-paperwork-engine/types").AutonomousPaperworkCandidateResult[];
  artifactPaths: {
    runnerState: string;
    runnerAudit: string;
    p97Audit: string;
    p97Rollback: string;
    p100Audit: string;
  };
  runnerHealth: {
    healthy: boolean;
    overlapPrevented: boolean;
    lastError: string | null;
    averageRunTimeMs: number | null;
  };
  nextScheduledRunAt: string | null;
};

export type AutonomousPaperworkRunnerCycleResult = {
  ok: boolean;
  skippedOverlap: boolean;
  mode: AutonomousPaperworkRunnerMode;
  report: AutonomousPaperworkRunnerReport;
  warnings: string[];
};
