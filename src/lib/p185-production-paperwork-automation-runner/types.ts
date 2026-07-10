export const P185_SOURCE_PHASE = "P185";
export const P185_OPERATOR = "Production Paperwork Automation Runner";

export type P185RunnerStatus =
  | "idle"
  | "running"
  | "paused"
  | "killed"
  | "circuit_open"
  | "misconfigured"
  | "degraded";

export type P185SchedulerStatus = "active" | "paused" | "misconfigured" | "disabled";

export type P185EnvelopeLifecycleState =
  | "prepared"
  | "send_requested"
  | "sent_unverified"
  | "confirmed_sent"
  | "viewed"
  | "signed"
  | "declined"
  | "canceled"
  | "failed"
  | "unknown";

export type P185LeaseRecord = {
  ownerId: string;
  cycleId: string;
  acquiredAt: string;
  expiresAt: string;
  heartbeatAt: string;
  version: number;
};

export type P185CursorState = {
  watermark: string | null;
  continuationToken: string | null;
  lastFullReconciliationAt: string | null;
  candidatesScannedTotal: number;
};

export type P185CircuitBreakerState = {
  open: boolean;
  openedAt: string | null;
  failureCount: number;
  lastFailureAt: string | null;
  cooldownUntil: string | null;
  reason: string | null;
};

export type P185SafetyConfig = {
  /** Master env-gated production automation flag (also checked via env). */
  productionAutomationEnabled: boolean;
  killSwitch: boolean;
  pauseUntil: string | null;
  maxSendsPerCycle: number;
  maxFailuresPerCycle: number;
  maxCandidatesPerCycle: number;
  executionBudgetMs: number;
  claimCutoffMs: number;
  leaseTtlMs: number;
  fullReconciliationIntervalMs: number;
  unresolvedEnvelopeAlertMs: number;
  expectedCycleIntervalMs: number;
  requireRecentDryRunMs: number;
};

export type P185EnvelopeRecord = {
  candidateId: string;
  envelopeId: string;
  idempotencyKey: string;
  state: P185EnvelopeLifecycleState;
  createdAt: string;
  updatedAt: string;
  verifiedAt: string | null;
  lastError: string | null;
  verificationAttempts: number;
};

export type P185OperationRecord = {
  id: string;
  candidateId: string;
  idempotencyKey: string;
  stage:
    | "queued"
    | "processing"
    | "send_requested"
    | "sent_unverified"
    | "confirmed"
    | "failed"
    | "retry_pending";
  envelopeId: string | null;
  createdAt: string;
  updatedAt: string;
  error: string | null;
};

export type P185Alert = {
  id: string;
  severity: "critical" | "warning" | "info";
  code: string;
  message: string;
  recommendedAction: string;
  at: string;
  active: boolean;
};

export type P185CycleSummary = {
  cycleId: string;
  startedAt: string;
  finishedAt: string;
  mode: "dry_run" | "live";
  skipped: boolean;
  skipReason: string | null;
  evaluated: number;
  eligible: number;
  sent: number;
  confirmed: number;
  failed: number;
  retriesDue: number;
  rateLimited: boolean;
  durationMs: number;
  storageDurable: boolean;
  leaseOwnerId: string | null;
  warnings: string[];
};

export type P185RunnerStateFile = {
  schemaVersion: 1;
  recordVersion: number;
  updatedAt: string;
  runnerStatus: P185RunnerStatus;
  safety: P185SafetyConfig;
  lease: P185LeaseRecord | null;
  cursor: P185CursorState;
  circuit: P185CircuitBreakerState;
  envelopes: P185EnvelopeRecord[];
  operations: P185OperationRecord[];
  alerts: P185Alert[];
  lastAttemptedCycle: P185CycleSummary | null;
  lastSuccessfulCycle: P185CycleSummary | null;
  lastLiveSendAt: string | null;
  lastDryRunSuccessAt: string | null;
  nextScheduledRunAt: string | null;
  skippedCycles: number;
  metrics: P185MetricsSnapshot;
};

export type P185MetricsSnapshot = {
  queueDepth: number;
  candidatesEvaluated: number;
  eligibleCandidates: number;
  sendsAttempted: number;
  sendsConfirmed: number;
  sendsFailed: number;
  unresolvedEnvelopes: number;
  retriesDue: number;
  cycleDurationMs: number | null;
  remainingExecutionBudgetMs: number | null;
};

export type P185HealthReport = {
  phase: typeof P185_SOURCE_PHASE;
  generatedAt: string;
  runnerStatus: P185RunnerStatus;
  schedulerStatus: P185SchedulerStatus;
  automationMode: "dry_run" | "live" | "disabled";
  lastAttemptedCycle: P185CycleSummary | null;
  lastSuccessfulCycle: P185CycleSummary | null;
  lastLiveSendAt: string | null;
  nextScheduledRunAt: string | null;
  lease: {
    held: boolean;
    ownerId: string | null;
    expiresAt: string | null;
    remainingMs: number | null;
    stale: boolean;
  };
  storage: {
    adapter: string;
    durable: boolean;
    healthy: boolean;
    detail: string;
  };
  breezySource: { healthy: boolean; detail: string };
  dropboxSign: { healthy: boolean; detail: string };
  schedulerAuth: { configured: boolean; detail: string };
  circuitBreaker: P185CircuitBreakerState;
  killSwitch: boolean;
  pauseUntil: string | null;
  metrics: P185MetricsSnapshot;
  alerts: P185Alert[];
  liveEnablementReady: boolean;
  liveEnablementBlockers: string[];
};

export type P185ValidationReport = {
  phase: typeof P185_SOURCE_PHASE;
  generatedAt: string;
  storageAdapterSelected: string;
  storageDurabilityResult: string;
  schedulerConfiguration: Record<string, unknown>;
  authenticationResult: string;
  leaseConcurrencySimulation: string;
  candidateSourceMapping: Array<{ source: string; target: string; fallback: string }>;
  dryRunCycleResults: Record<string, unknown>;
  restartRecoveryResults: string;
  reconciliationResults: string;
  circuitBreakerResults: string;
  duplicateSendSimulation: string;
  timeoutBudgetSimulation: string;
  productionBlockers: string[];
  liveEnablementReadiness: boolean;
  warnings: string[];
};

export const DEFAULT_P185_SAFETY: P185SafetyConfig = {
  productionAutomationEnabled: false,
  killSwitch: false,
  pauseUntil: null,
  maxSendsPerCycle: 10,
  maxFailuresPerCycle: 3,
  maxCandidatesPerCycle: 200,
  executionBudgetMs: 50_000,
  claimCutoffMs: 10_000,
  leaseTtlMs: 90_000,
  fullReconciliationIntervalMs: 6 * 60 * 60 * 1000,
  unresolvedEnvelopeAlertMs: 30 * 60 * 1000,
  expectedCycleIntervalMs: 10 * 60 * 1000,
  requireRecentDryRunMs: 24 * 60 * 60 * 1000,
};

export function emptyP185Metrics(): P185MetricsSnapshot {
  return {
    queueDepth: 0,
    candidatesEvaluated: 0,
    eligibleCandidates: 0,
    sendsAttempted: 0,
    sendsConfirmed: 0,
    sendsFailed: 0,
    unresolvedEnvelopes: 0,
    retriesDue: 0,
    cycleDurationMs: null,
    remainingExecutionBudgetMs: null,
  };
}

export function emptyP185RunnerState(): P185RunnerStateFile {
  return {
    schemaVersion: 1,
    recordVersion: 0,
    updatedAt: new Date(0).toISOString(),
    runnerStatus: "idle",
    safety: { ...DEFAULT_P185_SAFETY },
    lease: null,
    cursor: {
      watermark: null,
      continuationToken: null,
      lastFullReconciliationAt: null,
      candidatesScannedTotal: 0,
    },
    circuit: {
      open: false,
      openedAt: null,
      failureCount: 0,
      lastFailureAt: null,
      cooldownUntil: null,
      reason: null,
    },
    envelopes: [],
    operations: [],
    alerts: [],
    lastAttemptedCycle: null,
    lastSuccessfulCycle: null,
    lastLiveSendAt: null,
    lastDryRunSuccessAt: null,
    nextScheduledRunAt: null,
    skippedCycles: 0,
    metrics: emptyP185Metrics(),
  };
}
