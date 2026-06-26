export {
  P71_SOURCE_PHASE,
  P71_DEFAULT_AUTOMATION_ENABLED,
  P71_DEFAULT_EXECUTION_MODE,
} from "@/lib/autonomous-paperwork-execution-engine/types";
export type {
  AutonomousPaperworkExecutionDashboardSnapshot,
  AutonomousPaperworkExecutionPreviewResult,
  P71FeatureFlags,
  PaperworkExecutionAuditEvent,
  PaperworkExecutionAutomationControls,
  PaperworkExecutionEligibilityResult,
  PaperworkExecutionExecutiveMetrics,
  PaperworkExecutionMode,
  PaperworkExecutionQueueItem,
  PaperworkExecutionTimelineStep,
} from "@/lib/autonomous-paperwork-execution-engine/types";

export {
  DEFAULT_P71_FEATURE_FLAGS,
  canExecutePaperwork,
  isPreviewExecution,
  loadP71FeatureFlags,
  resolveP71FeatureFlagsFromEnv,
  saveP71FeatureFlags,
} from "@/lib/autonomous-paperwork-execution-engine/feature-flags-store";
export { buildPaperworkExecutionEligibility } from "@/lib/autonomous-paperwork-execution-engine/build-execution-eligibility";
export { runPreExecutionSafetyChecks } from "@/lib/autonomous-paperwork-execution-engine/execution-safety-checks";
export { buildPaperworkRetryPlan } from "@/lib/autonomous-paperwork-execution-engine/retry-engine";
export { buildPaperworkExecutionQueue } from "@/lib/autonomous-paperwork-execution-engine/build-execution-queue";
export { buildCandidateExecutionTimeline } from "@/lib/autonomous-paperwork-execution-engine/build-candidate-timeline";
export { buildPaperworkExecutionExecutiveMetrics } from "@/lib/autonomous-paperwork-execution-engine/build-executive-execution-metrics";
export { buildAutonomousPaperworkExecutionDashboard } from "@/lib/autonomous-paperwork-execution-engine/build-paperwork-execution-dashboard";
export { runPaperworkExecutionPreview } from "@/lib/autonomous-paperwork-execution-engine/run-paperwork-execution-preview";
export { simulateExecutionWorkflow } from "@/lib/autonomous-paperwork-execution-engine/simulate-execution-workflow";
export { passesPilotFilters, resolveEffectiveExecutionMode, buildPilotSummary } from "@/lib/autonomous-paperwork-execution-engine/pilot-filters";
export { buildP71NlAnswers, isP71PaperworkQueryId } from "@/lib/autonomous-paperwork-execution-engine/build-p71-nl-answers";
