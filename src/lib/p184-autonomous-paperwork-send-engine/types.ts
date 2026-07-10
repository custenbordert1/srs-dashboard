import type { OnboardingTemplateKey } from "@/lib/onboarding-template-registry";

export const P184_SOURCE_PHASE = "P184";
export const P184_OPERATOR = "Autonomous Engine";

export type P184EngineMode = "dry_run" | "live";

export type P184QueueItemStatus =
  | "queued"
  | "sending"
  | "sent"
  | "failed_transient"
  | "failed_permanent"
  | "skipped"
  | "cancelled";

export type P184EligibilityGateId =
  | "ready_for_paperwork"
  | "valid_email"
  | "not_archived"
  | "not_hired"
  | "no_paperwork_pending"
  | "no_paperwork_completed"
  | "cooldown_clear"
  | "not_opted_out"
  | "no_suppression_flag"
  | "job_active"
  | "position_accepting"
  | "no_duplicate"
  | "idempotency_clear";

export type P184EligibilityGate = {
  id: P184EligibilityGateId;
  label: string;
  passed: boolean;
  detail: string | null;
};

export type P184EligibilityResult = {
  candidateId: string;
  eligible: boolean;
  gates: P184EligibilityGate[];
  rejectionReasons: string[];
  templateKey: OnboardingTemplateKey | null;
  idempotencyKey: string;
};

export type P184RateLimitConfig = {
  maxPerMinute: number;
  maxPerHour: number;
  maxPerDay: number;
  concurrentSends: number;
};

export type P184RateLimitStatus = {
  config: P184RateLimitConfig;
  sentLastMinute: number;
  sentLastHour: number;
  sentLastDay: number;
  inFlight: number;
  limited: boolean;
  limitedBy: Array<"minute" | "hour" | "day" | "concurrent">;
  nextAvailableAt: string | null;
};

export type P184QueuePriority = {
  agingScore: number;
  demandScore: number;
  applicationAgeMs: number;
  executivePriority: number;
  composite: number;
};

export type P184QueueItem = {
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  positionId: string | null;
  jobName: string | null;
  templateKey: OnboardingTemplateKey;
  idempotencyKey: string;
  status: P184QueueItemStatus;
  priority: P184QueuePriority;
  enqueuedAt: string;
  updatedAt: string;
  retryCount: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  permanentFailure: boolean;
  envelopeId: string | null;
  sentAt: string | null;
  durationMs: number | null;
};

export type P184SendResult = {
  ok: boolean;
  candidateId: string;
  envelopeId: string | null;
  sentAt: string | null;
  templateKey: OnboardingTemplateKey;
  durationMs: number;
  simulated: boolean;
  transient: boolean;
  permanent: boolean;
  retryScheduled: boolean;
  error: string | null;
  idempotencyKey: string;
};

export type P184AuditEvent = {
  id: string;
  at: string;
  candidateId: string;
  candidateName: string;
  jobId: string | null;
  jobName: string | null;
  operator: typeof P184_OPERATOR;
  templateKey: OnboardingTemplateKey | null;
  envelopeId: string | null;
  status: P184QueueItemStatus | "evaluated" | "rejected" | "rate_limited";
  latencyMs: number | null;
  failureReason: string | null;
  retryCount: number;
  mode: P184EngineMode;
  idempotencyKey: string | null;
  simulated: boolean;
};

export type P184EngineConfig = {
  mode: P184EngineMode;
  enabled: boolean;
  rateLimits: P184RateLimitConfig;
  /** Hours before a permanent-ish failed send may be retried as a new attempt. */
  failureCooldownHours: number;
  maxRetries: number;
  maxSendsPerCycle: number;
  executivePriorityJobIds: string[];
  highDemandPositionIds: string[];
  updatedAt: string;
};

export type P184DashboardMetrics = {
  eligibleNow: number;
  queued: number;
  sending: number;
  completedToday: number;
  failedToday: number;
  retries: number;
  rateLimitStatus: P184RateLimitStatus;
  averageSendTimeMs: number | null;
  successPct: number;
  queueDepth: number;
  mode: P184EngineMode;
  enabled: boolean;
};

export type P184RejectionBucket = {
  reason: string;
  count: number;
  candidateIds: string[];
};

export type P184ValidationReport = {
  phase: typeof P184_SOURCE_PHASE;
  generatedAt: string;
  mode: P184EngineMode;
  evaluated: number;
  eligible: Array<{
    candidateId: string;
    candidateName: string;
    priority: P184QueuePriority;
    idempotencyKey: string;
  }>;
  rejected: Array<{
    candidateId: string;
    candidateName: string;
    reasons: string[];
  }>;
  rejectionReasons: P184RejectionBucket[];
  queueOrder: string[];
  projectedSends: number;
  estimatedCompletionMinutes: number | null;
  rateLimitStatus: P184RateLimitStatus;
  warnings: string[];
};

export type P184CycleResult = {
  mode: P184EngineMode;
  evaluated: number;
  eligible: number;
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
  retriesScheduled: number;
  rateLimited: boolean;
  durationMs: number;
  results: P184SendResult[];
  report: P184ValidationReport;
  metrics: P184DashboardMetrics;
};

export type P184EngineStateFile = {
  version: 1;
  updatedAt: string;
  config: P184EngineConfig;
  queue: P184QueueItem[];
  sendTimestamps: string[];
  completedIdempotencyKeys: string[];
};

export const DEFAULT_P184_RATE_LIMITS: P184RateLimitConfig = {
  maxPerMinute: 4,
  maxPerHour: 40,
  maxPerDay: 200,
  concurrentSends: 2,
};

export const DEFAULT_P184_CONFIG: P184EngineConfig = {
  mode: "dry_run",
  enabled: false,
  rateLimits: DEFAULT_P184_RATE_LIMITS,
  failureCooldownHours: 24,
  maxRetries: 3,
  maxSendsPerCycle: 25,
  executivePriorityJobIds: [],
  highDemandPositionIds: [],
  updatedAt: new Date(0).toISOString(),
};

/** Retry backoff schedule: 1 min, 5 min, 15 min. */
export const P184_RETRY_BACKOFF_MS = [60_000, 300_000, 900_000] as const;
