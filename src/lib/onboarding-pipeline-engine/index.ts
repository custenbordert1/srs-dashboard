export { P80_ONBOARDING_PIPELINE_STAGES, pipelineStageLabel, pipelineStageIndex } from "@/lib/onboarding-pipeline-engine/stages";
export { isOnboardingPipelineEligible } from "@/lib/onboarding-pipeline-engine/is-pipeline-eligible";
export {
  resolveOnboardingPipelineStage,
  buildCompletedPipelineStages,
  buildPipelineProgressPercent,
} from "@/lib/onboarding-pipeline-engine/resolve-pipeline-stage";
export { buildOnboardingPipelinePreviewActions } from "@/lib/onboarding-pipeline-engine/build-preview-actions";
export { buildOnboardingPipelineRecruiterActions } from "@/lib/onboarding-pipeline-engine/build-recruiter-actions";
export { buildOnboardingPipelineRecord } from "@/lib/onboarding-pipeline-engine/build-pipeline-record";
export { buildOnboardingPipelineExecutiveSummary } from "@/lib/onboarding-pipeline-engine/build-executive-summary";
export { buildOnboardingPipelineDashboardSnapshot } from "@/lib/onboarding-pipeline-engine/build-pipeline-dashboard";
export {
  runOnboardingPipelinePreview,
  buildOnboardingPipelineCandidatePreview,
} from "@/lib/onboarding-pipeline-engine/run-onboarding-pipeline-preview";
export type {
  OnboardingPipelineStage,
  OnboardingPipelineRecord,
  OnboardingPipelineTimelineEntry,
  OnboardingPipelinePreviewAction,
  OnboardingPipelineRecruiterAction,
  OnboardingPipelineExecutiveSummary,
  OnboardingPipelineDashboardSnapshot,
  OnboardingPipelinePreviewResult,
} from "@/lib/onboarding-pipeline-engine/types";
export { P80_PREVIEW_MODE } from "@/lib/onboarding-pipeline-engine/types";
