export { P80_ONBOARDING_PIPELINE_STAGES, pipelineStageLabel, pipelineStageIndex } from "@/lib/onboarding-pipeline-engine/stages";
export { isOnboardingPipelineEligible } from "@/lib/onboarding-pipeline-engine/is-pipeline-eligible";
export {
  resolveOnboardingPipelineStage,
  buildCompletedPipelineStages,
  buildPipelineProgressPercent,
} from "@/lib/onboarding-pipeline-engine/resolve-pipeline-stage";
export { buildOnboardingPipelinePreviewActions } from "@/lib/onboarding-pipeline-engine/build-preview-actions";
export { buildOnboardingPipelineRecruiterActions } from "@/lib/onboarding-pipeline-engine/build-recruiter-actions";
export { buildPrioritizedRecruiterActions } from "@/lib/onboarding-pipeline-engine/build-prioritized-recruiter-actions";
export { buildOnboardingPipelineRecord } from "@/lib/onboarding-pipeline-engine/build-pipeline-record";
export { buildOnboardingPipelineExecutiveSummary } from "@/lib/onboarding-pipeline-engine/build-executive-summary";
export { buildOnboardingPipelineDashboardSnapshot } from "@/lib/onboarding-pipeline-engine/build-pipeline-dashboard";
export {
  runOnboardingPipelinePreview,
  buildOnboardingPipelineCandidatePreview,
} from "@/lib/onboarding-pipeline-engine/run-onboarding-pipeline-preview";
export {
  buildOnboardingDueDateSchedule,
  dueDateForStage,
  isOverdue,
  isDueWithinDays,
  daysBetween,
  P81_DUE_DATE_OFFSETS_DAYS,
} from "@/lib/onboarding-pipeline-engine/due-date-engine";
export { buildWelcomeEmailWorkflowPreview } from "@/lib/onboarding-pipeline-engine/build-welcome-email-workflow";
export { buildTrainingWorkflowAssignments } from "@/lib/onboarding-pipeline-engine/build-training-workflow-preview";
export { buildWelcomeWorkflowTasks } from "@/lib/onboarding-pipeline-engine/build-welcome-workflow-tasks";
export { buildOnboardingReadinessScore } from "@/lib/onboarding-pipeline-engine/build-readiness-score";
export { buildOnboardingActivityHistory } from "@/lib/onboarding-pipeline-engine/build-activity-history";
export type {
  OnboardingPipelineStage,
  OnboardingPipelineRecord,
  OnboardingPipelineTimelineEntry,
  OnboardingPipelinePreviewAction,
  OnboardingPipelineRecruiterAction,
  OnboardingPipelineExecutiveSummary,
  OnboardingPipelineDashboardSnapshot,
  OnboardingPipelinePreviewResult,
  WelcomeEmailWorkflowPreview,
  TrainingWorkflowAssignment,
  WelcomeWorkflowTask,
  OnboardingReadinessScore,
  OnboardingActivityHistoryEntry,
  OnboardingDueDateScheduleSnapshot,
} from "@/lib/onboarding-pipeline-engine/types";
export { P80_PREVIEW_MODE } from "@/lib/onboarding-pipeline-engine/types";
