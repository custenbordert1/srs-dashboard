/**
 * Canonical E2E autonomous recruiting entry (P243).
 * Distinct from P154.7 continuous runner (`p154-continuous-autonomous-recruiting-runner`).
 */
export {
  runAutonomousRecruitingCycle,
  pullPendingCandidates,
  pollBreezyLivePreview,
  smartPollBreezy,
  readBreezyWebhookInbox,
  dedupeBreezyCandidates,
  P243_SOURCE_PHASE,
  P243_SCHEMA_VERSION,
  p243IdempotencyStorePath,
  loadP243IdempotencyStore,
  buildP243Fingerprint,
  hasAlreadySentPaperwork,
  evaluateP243StateMachine,
  isNeverSendTwiceBlocked,
  runP243Preflight,
  buildP243PipelineHealthReport,
  formatP243PipelineHealthMarkdown,
  runP243PipelineHealthCheck,
} from "@/lib/p243-autonomous-end-to-end-pipeline";

export type {
  AutonomousCycleOptions,
  AutonomousCycleReport,
  AutonomousCandidateResult,
  AutonomousCandidateOutcome,
  P243ExecutionMode,
  P243PreflightCheck,
  PullPendingResult,
  P243PipelineHealthReport,
  P243PipelineHealthCheckOptions,
  P243PipelineHealthCheckResult,
} from "@/lib/p243-autonomous-end-to-end-pipeline";
