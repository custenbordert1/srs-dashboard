export {
  P184_SOURCE_PHASE,
  P184_OPERATOR,
  P184_RETRY_BACKOFF_MS,
  DEFAULT_P184_CONFIG,
  DEFAULT_P184_RATE_LIMITS,
} from "@/lib/p184-autonomous-paperwork-send-engine/types";
export type {
  P184EngineMode,
  P184QueueItemStatus,
  P184EligibilityGateId,
  P184EligibilityGate,
  P184EligibilityResult,
  P184RateLimitConfig,
  P184RateLimitStatus,
  P184QueuePriority,
  P184QueueItem,
  P184SendResult,
  P184AuditEvent,
  P184EngineConfig,
  P184DashboardMetrics,
  P184RejectionBucket,
  P184ValidationReport,
  P184CycleResult,
  P184EngineStateFile,
} from "@/lib/p184-autonomous-paperwork-send-engine/types";

export {
  evaluateP184Eligibility,
  buildP184IdempotencyKey,
  isPermanentSendFailure,
} from "@/lib/p184-autonomous-paperwork-send-engine/evaluator";
export type { P184VerifiedOnboardingJob } from "@/lib/p184-autonomous-paperwork-send-engine/evaluator";
export {
  evaluateP184RateLimit,
  pruneSendTimestamps,
  canAcquireSendSlot,
} from "@/lib/p184-autonomous-paperwork-send-engine/rateLimiter";
export { sendP184Paperwork } from "@/lib/p184-autonomous-paperwork-send-engine/sender";
export type { P184SenderDeps } from "@/lib/p184-autonomous-paperwork-send-engine/sender";
export {
  appendP184AuditEvent,
  listP184AuditEvents,
} from "@/lib/p184-autonomous-paperwork-send-engine/audit";
export {
  loadP184EngineState,
  saveP184EngineState,
  updateP184Config,
  upsertP184QueueItems,
} from "@/lib/p184-autonomous-paperwork-send-engine/store";
export {
  runP184AutonomousPaperworkSendEngine,
  computeP184Priority,
  sortP184Queue,
  buildP184DashboardMetrics,
} from "@/lib/p184-autonomous-paperwork-send-engine/engine";
export {
  buildP184ValidationReport,
  buildP184RejectionBuckets,
  estimateP184CompletionMinutes,
  formatP184Markdown,
} from "@/lib/p184-autonomous-paperwork-send-engine/report";
export { getP184DashboardSnapshot } from "@/lib/p184-autonomous-paperwork-send-engine/dashboard";
