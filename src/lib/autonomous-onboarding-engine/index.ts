export {
  P67_PREVIEW_MODE,
  P67_1_SOURCE_PHASE,
  P67_SOURCE_MODULE,
  P67_SOURCE_PHASE,
  AUTONOMOUS_ONBOARDING_STATE_LABELS,
  type AutonomousOnboardingDashboardSnapshot,
  type AutonomousOnboardingPreviewResult,
  type AutonomousOnboardingState,
  type AutomationHookDefinition,
  type OnboardingActivityTimelineEntry,
  type OnboardingExecutiveProgressMetrics,
  type OnboardingLastActivity,
  type OnboardingProgressSummary,
  type OnboardingStallAssessment,
  type OnboardingStallLevel,
  type OnboardingWorkspaceCandidateSnapshot,
  type ReadyForWorkReadiness,
  type TrainingModuleDefinition,
  type WelcomeEmailPreview,
} from "@/lib/autonomous-onboarding-engine/types";
export {
  AUTONOMOUS_ONBOARDING_TRANSITIONS,
  AUTONOMOUS_ONBOARDING_STATE_ORDER,
  isPaperworkSigned,
  isPaperworkSent,
  listValidTransitionsFrom,
  resolveAutonomousOnboardingState,
  stateLabel,
} from "@/lib/autonomous-onboarding-engine/state-machine";
export {
  TRAINING_MODULE_REGISTRY,
  getTrainingModule,
  listTrainingModules,
  resolveRecruitingContactPhone,
  resolveTrainingModuleUrl,
  resolveWelcomeReplyToEmail,
} from "@/lib/autonomous-onboarding-engine/training-module-registry";
export {
  buildTrainingAssignmentPreview,
  buildWelcomeEmailPreview,
} from "@/lib/autonomous-onboarding-engine/build-welcome-and-training-preview";
export { buildReadyForWorkReadiness } from "@/lib/autonomous-onboarding-engine/build-ready-for-work-readiness";
export { buildOnboardingProgressSummary } from "@/lib/autonomous-onboarding-engine/build-onboarding-progress";
export { listOnboardingProgressStepDefinitions } from "@/lib/autonomous-onboarding-engine/onboarding-progress-registry";
export {
  buildOnboardingActivityTimeline,
  buildOnboardingLastActivity,
  buildOnboardingStallAssessment,
  formatElapsedSince,
} from "@/lib/autonomous-onboarding-engine/build-onboarding-activity-intelligence";
export { buildOnboardingExecutiveProgressMetrics } from "@/lib/autonomous-onboarding-engine/build-executive-progress-metrics";
export {
  AUTONOMOUS_ONBOARDING_AUTOMATION_HOOKS,
  hooksForState,
  listAutomationHookDefinitions,
} from "@/lib/autonomous-onboarding-engine/build-automation-hook-definitions";
export {
  buildOnboardingWorkspaceCandidateSnapshot,
  isAutonomousOnboardingPipelineCandidate,
} from "@/lib/autonomous-onboarding-engine/build-onboarding-workspace-snapshot";
export { buildAutonomousOnboardingDashboardSnapshot } from "@/lib/autonomous-onboarding-engine/build-autonomous-onboarding-dashboard";
export {
  buildAutonomousOnboardingCandidatePreview,
  runAutonomousOnboardingPreview,
} from "@/lib/autonomous-onboarding-engine/run-autonomous-onboarding-preview";
