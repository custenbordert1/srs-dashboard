export {
  P243_SOURCE_PHASE,
  P243_SCHEMA_VERSION,
} from "@/lib/p243-autonomous-end-to-end-pipeline/types";
export type {
  AutonomousCycleOptions,
  AutonomousCandidateOutcome,
  AutonomousCandidateResult,
  AutonomousCycleReport,
  P243ExecutionMode,
  P243PreflightCheck,
  P243FailureReasonCount,
} from "@/lib/p243-autonomous-end-to-end-pipeline/types";

export { runAutonomousRecruitingCycle } from "@/lib/p243-autonomous-end-to-end-pipeline/run";
export {
  pullPendingCandidates,
  pollBreezyLivePreview,
  smartPollBreezy,
  readBreezyWebhookInbox,
  dedupeBreezyCandidates,
} from "@/lib/p243-autonomous-end-to-end-pipeline/pull";
export type { PullPendingResult, P243IngestionMeta } from "@/lib/p243-autonomous-end-to-end-pipeline/pull";
export {
  p243IdempotencyStorePath,
  loadP243IdempotencyStore,
  saveP243IdempotencyStore,
  buildP243Fingerprint,
  hasAlreadySentPaperwork,
  shouldSkipIdempotent,
  recordIdempotent,
  normalizeEmailFingerprint,
  touchLastChecked,
} from "@/lib/p243-autonomous-end-to-end-pipeline/idempotency";
export type {
  P243IdempotencyRecord,
  P243IdempotencyStoreFile,
} from "@/lib/p243-autonomous-end-to-end-pipeline/idempotency";
export {
  evaluateP243StateMachine,
  isNeverSendTwiceBlocked,
} from "@/lib/p243-autonomous-end-to-end-pipeline/state-machine";
export { runP243Preflight } from "@/lib/p243-autonomous-end-to-end-pipeline/preflight";
export {
  buildP243FailureReasonExamples,
  buildP243DataQualityIssueCounts,
  buildP243HealthRecommendations,
  buildP243PipelineHealthReport,
  formatP243PipelineHealthMarkdown,
} from "@/lib/p243-autonomous-end-to-end-pipeline/health";
export type {
  P243FailureReasonExample,
  P243DataQualityIssueCount,
  P243QualificationDelta,
  P243OutcomeTally,
  P243PipelineHealthReport,
} from "@/lib/p243-autonomous-end-to-end-pipeline/health";
export { runP243PipelineHealthCheck } from "@/lib/p243-autonomous-end-to-end-pipeline/validate-health";
export type {
  P243PipelineHealthCheckOptions,
  P243PipelineHealthCheckResult,
} from "@/lib/p243-autonomous-end-to-end-pipeline/validate-health";
