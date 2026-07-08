import type { P157DecisionAction } from "@/lib/p157-recruiter-decision-engine/types";

export const P169_SOURCE_PHASE = "P169" as const;
export const P169_ORCHESTRATOR_VERSION = 1 as const;
export const P169_DEFAULT_CYCLE_INTERVAL_MS = 7 * 60_000;
export const P169_DEFAULT_MIN_CONFIDENCE = 80;
export const P169_DEFAULT_READINESS_THRESHOLD = 80;
export const P169_DEFAULT_MAX_RETRIES = 3;
export const P169_DEFAULT_MAX_SENDS_PER_CYCLE = 10;
export const P169_MAX_CYCLE_HISTORY = 100;
export const P169_STALE_LOCK_MS = 5 * 60_000;

export type P169OrchestratorStatus = "running" | "idle" | "paused";

export type P169CandidateOutcome =
  | "AUTO_SEND_PAPERWORK"
  | "WAIT_NEXT_CYCLE"
  | "WAIT_SIGNATURE"
  | "READY_FOR_MEL"
  | "NEEDS_MANUAL_REVIEW"
  | "REJECT";

export type P169CandidateEvaluation = {
  candidateId: string;
  candidateName: string;
  email: string | null;
  outcome: P169CandidateOutcome;
  confidence: number;
  reason: string;
  blockingFactors: string[];
  estimatedNextAction: string;
  estimatedNextRun: string | null;
  p157Action: P157DecisionAction;
  recruiter: string;
  position: string;
  workflowStatus: string;
};

export type P169OrchestratorConfig = {
  enabled: boolean;
  paused: boolean;
  cycleIntervalMs: number;
  maxSendsPerCycle: number;
  dropboxBudgetReserve: number;
  minimumConfidence: number;
  maximumRetries: number;
  exceptionThreshold: number;
  readinessThreshold: number;
  maintenanceWindows: Array<{ start: string; end: string; label?: string }>;
  pauseSchedule: { pausedUntil: string | null; reason: string | null };
  updatedAt: string;
};

export type P169CycleSkipReason =
  | "orchestrator_disabled"
  | "orchestrator_paused"
  | "maintenance_window"
  | "processing_lock"
  | "safety_gates_failed"
  | "scheduler_wait"
  | "approval_not_run_next_batch"
  | "consecutive_failures"
  | "minimum_interval";

export type P169OrchestratorCycleRecord = {
  cycleId: string;
  sourcePhase: typeof P169_SOURCE_PHASE;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: "success" | "skipped" | "failed" | "partial";
  skipReason: P169CycleSkipReason | null;
  candidatesEvaluated: number;
  candidatesSent: number;
  candidatesSkipped: number;
  exceptionsCreated: number;
  readyForMel: number;
  waitingSignature: number;
  autoSendEligible: number;
  dropboxRequests: number | null;
  averageSendTimeMs: number | null;
  failures: number;
  retries: number;
  skipReasons: string[];
  gateBlockingFactors: string[];
  executedLiveCycle: boolean;
  paperworkSent: number | null;
  healthScore: number;
  schedulerRecommendation: string;
  runnerStatus: string;
};

export type P169OrchestratorState = {
  version: typeof P169_ORCHESTRATOR_VERSION;
  status: P169OrchestratorStatus;
  config: P169OrchestratorConfig;
  lastCycleAt: string | null;
  lastSuccessfulCycleAt: string | null;
  nextCycleAt: string | null;
  consecutiveFailures: number;
  processingLock: { cycleId: string; lockedAt: string } | null;
  lastCycle: P169OrchestratorCycleRecord | null;
  lastCandidateEvaluations: P169CandidateEvaluation[];
  executiveAlertRaisedAt: string | null;
  updatedAt: string;
};

export type P169OperationsConsole = {
  sourcePhase: typeof P169_SOURCE_PHASE;
  generatedAt: string;
  readOnly: boolean;
  status: P169OrchestratorStatus;
  statusLabel: string;
  enabled: boolean;
  paused: boolean;
  lastCycle: {
    at: string | null;
    agoLabel: string;
    durationMs: number | null;
    candidatesEvaluated: number;
    paperworkSent: number;
    skipped: number;
    exceptions: number;
    dropboxRequests: number | null;
  };
  nextCycle: {
    at: string | null;
    inMs: number | null;
    inLabel: string;
  };
  metrics: {
    candidatesEvaluated: number;
    paperworkSent: number;
    skipped: number;
    exceptions: number;
    readyForMel: number;
    waitingSignature: number;
    dropboxRequests: number | null;
  };
  dropbox: {
    currentBudget: number;
    usedToday: number;
    withinBudget: boolean;
  };
  runner: {
    status: string;
    healthy: boolean;
  };
  scheduler: {
    recommendation: string;
    nextRecommendedRunAt: string | null;
  };
  health: {
    score: number;
    label: "healthy" | "warning" | "critical";
  };
  config: P169OrchestratorConfig;
  recentCycles: P169OrchestratorCycleRecord[];
  warnings: string[];
};

export type P169ExceptionQueueReport = {
  sourcePhase: typeof P169_SOURCE_PHASE;
  generatedAt: string;
  readOnly: true;
  totalExceptions: number;
  byCategory: Array<{ category: string; count: number }>;
  exceptions: P169CandidateEvaluation[];
  lastCycleAt: string | null;
  warnings: string[];
};

export type P169CycleResult = {
  ok: boolean;
  cycle: P169OrchestratorCycleRecord;
  evaluations: P169CandidateEvaluation[];
  warnings: string[];
};
