export {
  P70_PREVIEW_MODE,
  P70_SOURCE_PHASE,
  AUTONOMOUS_PAPERWORK_PIPELINE_STAGES,
} from "@/lib/autonomous-paperwork-engine/types";
export type {
  AutonomousPaperworkDashboardSnapshot,
  AutonomousPaperworkPreviewResult,
  PaperworkAutomationReadiness,
  PaperworkExecutiveMetrics,
  PaperworkLifecycleStatus,
  PaperworkQueueRow,
  PaperworkTodayActivityCard,
  RecruiterPaperworkMetricsRow,
} from "@/lib/autonomous-paperwork-engine/types";

export { buildAutonomousPaperworkDashboard } from "@/lib/autonomous-paperwork-engine/build-autonomous-paperwork-dashboard";
export { runAutonomousPaperworkPreview } from "@/lib/autonomous-paperwork-engine/run-autonomous-paperwork-preview";
export {
  buildPaperworkAutoEligibility,
  lifecycleStatusLabel,
  resolvePaperworkLifecycleStatus,
  resolvePaperworkSendSource,
} from "@/lib/autonomous-paperwork-engine/paperwork-lifecycle";
export { buildPaperworkTodayActivity } from "@/lib/autonomous-paperwork-engine/build-today-activity";
export {
  buildPaperworkAutomationReadiness,
  buildPaperworkCandidateQueue,
  buildPaperworkExecutiveMetrics,
  buildRecruiterPaperworkMetrics,
} from "@/lib/autonomous-paperwork-engine/build-paperwork-queue-intelligence";
export { buildPaperworkNlAnswers } from "@/lib/autonomous-paperwork-engine/build-paperwork-nl-answers";
