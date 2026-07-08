import type { P157DecisionAction } from "@/lib/p157-recruiter-decision-engine/types";

export const P171_SOURCE_PHASE = "P171" as const;
export const P171_LIFECYCLE_VERSION = 1 as const;
export const P171_DEFAULT_CYCLE_INTERVAL_MS = 15 * 60_000;
export const P171_DEFAULT_MIN_CONFIDENCE = 80;
export const P171_DEFAULT_MAX_RETRIES = 3;
export const P171_DEFAULT_MAX_REMINDERS = 3;
export const P171_DEFAULT_REMINDER_HOURS = [24, 48, 72] as const;
export const P171_MAX_CYCLE_HISTORY = 100;
export const P171_STALE_LOCK_MS = 5 * 60_000;

/** Deterministic lifecycle states — forward-only transitions except EXCEPTION. */
export type P171LifecycleState =
  | "NEW"
  | "DISCOVERED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "PAPERWORK_SENT"
  | "WAITING_SIGNATURE"
  | "SIGNED"
  | "READY_FOR_MEL"
  | "PLACED"
  | "COMPLETED"
  | "EXCEPTION";

export const P171_LIFECYCLE_STATE_ORDER: P171LifecycleState[] = [
  "NEW",
  "DISCOVERED",
  "UNDER_REVIEW",
  "APPROVED",
  "PAPERWORK_SENT",
  "WAITING_SIGNATURE",
  "SIGNED",
  "READY_FOR_MEL",
  "PLACED",
  "COMPLETED",
];

export type P171SignatureStatus =
  | "NOT_SENT"
  | "SENT"
  | "VIEWED"
  | "PARTIALLY_COMPLETED"
  | "SIGNED"
  | "DECLINED"
  | "EXPIRED";

export type P171ExceptionCategory =
  | "duplicate"
  | "missing_email"
  | "invalid_phone"
  | "paperwork_expired"
  | "signature_declined"
  | "dropbox_failure"
  | "api_timeout"
  | "low_confidence"
  | "manual_review";

export type P171LifecycleTransition = {
  id: string;
  from: P171LifecycleState | null;
  to: P171LifecycleState;
  at: string;
  cycleId: string | null;
  reason: string;
  source: "discovery" | "evaluation" | "orchestrator" | "signature_monitor" | "reminder" | "recovery" | "manual";
  auditable: true;
};

export type P171CandidateLifecycleRecord = {
  candidateId: string;
  candidateName: string;
  email: string | null;
  position: string;
  state: P171LifecycleState;
  signatureStatus: P171SignatureStatus;
  exceptionCategory: P171ExceptionCategory | null;
  exceptionReason: string | null;
  exceptionResolvedAt: string | null;
  confidence: number | null;
  p157Action: P157DecisionAction | null;
  reminderCount: number;
  lastReminderAt: string | null;
  discoveredAt: string | null;
  evaluatedAt: string | null;
  paperworkSentAt: string | null;
  signedAt: string | null;
  readyForMelAt: string | null;
  lastProcessedCycleId: string | null;
  transitions: P171LifecycleTransition[];
  updatedAt: string;
};

export type P171LifecycleConfig = {
  enabled: boolean;
  paused: boolean;
  cycleIntervalMs: number;
  minimumConfidence: number;
  maximumRetries: number;
  exceptionThreshold: number;
  maxRemindersPerCandidate: number;
  reminderHours: number[];
  readinessThreshold: number;
  pauseSchedule: { pausedUntil: string | null; reason: string | null };
  updatedAt: string;
};

export type P171LifecycleManagerStatus = "running" | "idle" | "paused";

export type P171CycleSkipReason =
  | "lifecycle_disabled"
  | "lifecycle_paused"
  | "processing_lock"
  | "safety_gates_failed"
  | "scheduler_wait"
  | "approval_not_run_next_batch"
  | "consecutive_failures"
  | "minimum_interval";

export type P171LifecycleCycleRecord = {
  cycleId: string;
  sourcePhase: typeof P171_SOURCE_PHASE;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  status: "success" | "skipped" | "failed" | "partial";
  skipReason: P171CycleSkipReason | null;
  candidatesDiscovered: number;
  candidatesEvaluated: number;
  candidatesProcessed: number;
  candidatesSkipped: number;
  paperworkSent: number;
  remindersSent: number;
  signaturesSynced: number;
  readyForMel: number;
  waitingSignature: number;
  exceptionsCreated: number;
  exceptionsResolved: number;
  recruiterInterventionsSaved: number;
  automationSuccessRate: number;
  exceptionRate: number;
  discoveryLatencyMs: number | null;
  evaluationLatencyMs: number | null;
  paperworkLatencyMs: number | null;
  signatureLatencyMs: number | null;
  averageCompletionTimeMs: number | null;
  executedLiveCycle: boolean;
  executedSignatureMonitor: boolean;
  executedReminders: boolean;
  gateBlockingFactors: string[];
  skipReasons: string[];
  healthScore: number;
};

export type P171LifecycleManagerState = {
  version: typeof P171_LIFECYCLE_VERSION;
  status: P171LifecycleManagerStatus;
  config: P171LifecycleConfig;
  lastCycleAt: string | null;
  lastSuccessfulCycleAt: string | null;
  nextCycleAt: string | null;
  consecutiveFailures: number;
  processingLock: { cycleId: string; lockedAt: string } | null;
  lastCycle: P171LifecycleCycleRecord | null;
  candidates: Record<string, P171CandidateLifecycleRecord>;
  executiveAlertRaisedAt: string | null;
  updatedAt: string;
};

export type P171LifecycleMetrics = {
  candidatesProcessedToday: number;
  paperworkAutomaticallySent: number;
  readyForMel: number;
  waitingSignature: number;
  averageCompletionTimeMs: number | null;
  automationSuccessRate: number;
  exceptionRate: number;
  recruiterInterventionsSaved: number;
  discoveryLatencyMs: number | null;
  evaluationLatencyMs: number | null;
  paperworkLatencyMs: number | null;
  signatureLatencyMs: number | null;
  automationPercent: number;
  recruiterInterventionPercent: number;
};

export type P171LifecycleConsole = {
  sourcePhase: typeof P171_SOURCE_PHASE;
  generatedAt: string;
  readOnly: boolean;
  status: P171LifecycleManagerStatus;
  statusLabel: string;
  enabled: boolean;
  paused: boolean;
  lastCycle: {
    at: string | null;
    agoLabel: string;
    durationMs: number | null;
    candidatesProcessed: number;
    paperworkSent: number;
    remindersSent: number;
    exceptions: number;
    readyForMel: number;
    waitingSignature: number;
  };
  nextCycle: {
    at: string | null;
    inMs: number | null;
    inLabel: string;
  };
  metrics: P171LifecycleMetrics;
  stateDistribution: Array<{ state: P171LifecycleState; count: number }>;
  health: {
    score: number;
    label: "healthy" | "warning" | "critical";
  };
  config: P171LifecycleConfig;
  recentCycles: P171LifecycleCycleRecord[];
  warnings: string[];
};

export type P171LifecycleException = {
  candidateId: string;
  candidateName: string;
  email: string | null;
  category: P171ExceptionCategory;
  reason: string;
  state: P171LifecycleState;
  confidence: number | null;
  p157Action: P157DecisionAction | null;
  recruiter: string;
  position: string;
  createdAt: string;
  resolvedAt: string | null;
};

export type P171ExceptionQueueReport = {
  sourcePhase: typeof P171_SOURCE_PHASE;
  generatedAt: string;
  readOnly: true;
  totalExceptions: number;
  byCategory: Array<{ category: string; count: number }>;
  exceptions: P171LifecycleException[];
  lastCycleAt: string | null;
  warnings: string[];
};

export type P171TimelineEntry = {
  id: string;
  label: string;
  at: string | null;
  completed: boolean;
  detail?: string;
};

export type P171CandidateTimeline = {
  candidateId: string;
  candidateName: string;
  currentState: P171LifecycleState;
  entries: P171TimelineEntry[];
  generatedAt: string;
};

export type P171CycleResult = {
  ok: boolean;
  cycle: P171LifecycleCycleRecord;
  warnings: string[];
};
