export const P1544_SOURCE_PHASE = "P154.4";
export const P1544_DEFAULT_INTERVAL_MINUTES = 10;
export const P1544_DEFAULT_BACKFILL_SINCE = "2026-06-01";
export const P1544_DEFAULT_MAX_ASSIGNMENTS = 25;
export const P1544_DEFAULT_MAX_SENDS = 10;
export const P1544_STALE_LOCK_MS = 15 * 60 * 1000;
export const P1544_POSITION_CHUNK_SIZE = 20;
export const P1544_BACKFILL_CHUNK_RUNTIME_MS = 60_000;
export const P1544_CLOSED_ARCHIVED_BACKFILL_BUDGET_MS = 8 * 60_000;

export type P1544SchedulerMode = "stopped" | "manual" | "continuous" | "paused";

export type P1544JobPipelineState = "published" | "closed" | "archived";

export type P1544EligibilityBucket =
  | "eligible_for_paperwork"
  | "already_sent"
  | "active_signature_request"
  | "already_signed"
  | "duplicate"
  | "invalid_email"
  | "disqualified_archived"
  | "needs_recruiter_assignment"
  | "manual_review"
  | "do_not_send";

export type P1544BackfillReport = {
  backfillSince: string;
  backfillThrough: string;
  totalPositionsScanned: number;
  activePositionsScanned: number;
  closedPositionsScanned: number;
  archivedPositionsScanned: number;
  totalCandidatesFound: number;
  candidatesSinceJune: number;
  candidatesAlreadyInStore: number;
  newlyDiscoveredCandidates: number;
  candidatesMissingBeforeBackfill: number;
  mergedIntoStore: number;
  workflowsCreated: number;
  workflowsReconciled: number;
  truncated: boolean;
  warnings: string[];
  executionTimeMs: number;
};

export type P1544ClassificationRow = {
  candidateId: string;
  candidateName: string;
  bucket: P1544EligibilityBucket;
  reason: string;
};

export type P1544ClassificationReport = {
  backfillSince: string;
  totalClassified: number;
  buckets: Record<P1544EligibilityBucket, number>;
  rows: P1544ClassificationRow[];
};

export type P1544DashboardMetrics = {
  totalCandidatesScanned: number;
  totalSinceJune: number;
  newCandidatesDiscovered: number;
  eligibleToday: number;
  sentToday: number;
  signedToday: number;
  activeSignatureRequests: number;
  duplicatesPrevented: number;
  queueRemaining: number;
  nextScheduledRunAt: string | null;
  lastSuccessfulRunAt: string | null;
};

export type P1544ProcessingLock = {
  runId: string;
  lockedAt: string;
  mode: P1544SchedulerMode;
};

export type P1544ContinuousState = {
  version: string;
  schedulerMode: P1544SchedulerMode;
  continuousEnabled: boolean;
  scheduleIntervalMs: number;
  backfillSince: string;
  limits: {
    maxAssignmentsPerCycle: number;
    maxPaperworkSendsPerCycle: number;
  };
  processingLock: P1544ProcessingLock | null;
  lastBackfillAt: string | null;
  lastCycleAt: string | null;
  lastSuccessfulCycleAt: string | null;
  nextScheduledRunAt: string | null;
  lastError: string | null;
  dashboard: P1544DashboardMetrics;
  updatedAt: string;
};

export type P1544CycleReport = {
  sourcePhase: typeof P1544_SOURCE_PHASE;
  generatedAt: string;
  dryRun: boolean;
  skippedOverlap: boolean;
  backfill: P1544BackfillReport;
  classification: P1544ClassificationReport;
  controlledCycle: import("@/lib/p154-controlled-production-autopilot-activation/types").ControlledProductionAutopilotCycleReport | null;
  dashboard: P1544DashboardMetrics;
  safetyFlags: {
    breezyWrites: false;
    duplicatePreventionActive: boolean;
    overlapLockActive: boolean;
    stopOnFirstError: boolean;
    auditLoggingEnabled: boolean;
  };
};
