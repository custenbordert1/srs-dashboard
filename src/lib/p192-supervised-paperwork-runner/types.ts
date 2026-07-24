/** P192 — Supervised 10-minute continuous paperwork runner (local process). */

export const P192_SOURCE_PHASE = "P192" as const;
export const P192_SCHEMA_VERSION = 1 as const;
export const P192_INTERVAL_MS = 10 * 60 * 1000;
export const P192_MAX_SENDS_PER_CYCLE = 10;
export const P192_MAX_FAILURES_PER_CYCLE = 3;
export const P192_RATE_LIMITS = {
  maxPerMinute: 4,
  maxPerHour: 40,
  maxPerDay: 200,
  concurrentSends: 2,
} as const;

export const P192_LOCK_FILE = "p192-supervised-runner.lock";
export const P192_STOP_FILE = "p192-supervised-runner-stop.flag";
export const P192_STATUS_FILE = "p192-supervised-runner-status.json";
export const P192_CONTROL_FILE = "p192-supervised-runner-control.json";

export type P192RunnerPhase =
  | "starting"
  | "preflight"
  | "dry_run_validation"
  | "running"
  | "waiting"
  | "paused"
  | "stopping"
  | "stopped"
  | "aborted";

export type P192CycleSummary = {
  cycleId: string;
  cycleNumber: number;
  startedAt: string;
  finishedAt: string;
  evaluated: number;
  eligible: number;
  queued: number;
  attempted: number;
  confirmedSent: number;
  sentUnverified: number;
  failed: number;
  skipped: number;
  duplicatesPrevented: number;
  remainingEligible: number;
  envelopeTotals: Record<string, number>;
  p184Mode: string;
  storageStatus: string;
  leaseStatus: string;
  circuitStatus: string;
  killSwitch: boolean;
  testMode: boolean | null;
  nextCycleAt: string | null;
  paused: boolean;
  pauseReason: string | null;
  recommendationsAutomated: 0;
  approvalsAutomated: 0;
  melWrites: 0;
};

export type P192RunnerStatus = {
  phase: P192RunnerPhase;
  sourcePhase: typeof P192_SOURCE_PHASE;
  updatedAt: string;
  startedAt: string | null;
  pid: number | null;
  ownerId: string | null;
  leaseOwnerId: string | null;
  leaseExpiresAt: string | null;
  cycleCount: number;
  lastCycle: P192CycleSummary | null;
  nextCycleAt: string | null;
  p184Mode: string;
  testMode: boolean | null;
  productionModeConfirmed: boolean;
  storageHealthy: boolean;
  circuitOpen: boolean;
  killSwitch: boolean;
  stopRequested: boolean;
  pauseReason: string | null;
};

export type P192PreflightResult = {
  ok: boolean;
  checkedAt: string;
  gates: Array<{ id: string; ok: boolean; detail: string }>;
  abortReasons: string[];
  testMode: boolean | null;
  p184Mode: string;
  productionModeConfirmed: boolean;
  dryRun: {
    evaluated: number;
    eligible: number;
    duplicateRisks: number;
    unresolvedOperations: number;
    templatesReady: boolean;
    predictedRealSends: number;
  } | null;
};
