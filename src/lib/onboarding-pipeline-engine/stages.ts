import type { OnboardingPipelineStage } from "@/lib/onboarding-pipeline-engine/types";

export const P80_ONBOARDING_PIPELINE_STAGES: readonly OnboardingPipelineStage[] = [
  "paperwork_complete",
  "welcome_email_ready",
  "mel_test_assigned",
  "store_call_assigned",
  "training_pending",
  "ready_for_work",
] as const;

const STAGE_LABELS: Record<OnboardingPipelineStage, string> = {
  paperwork_complete: "Paperwork Complete",
  welcome_email_ready: "Welcome Email Ready",
  mel_test_assigned: "MEL Test Assigned",
  store_call_assigned: "Store Call Assigned",
  training_pending: "Training Pending",
  ready_for_work: "Ready for Work",
};

export function pipelineStageLabel(stage: OnboardingPipelineStage): string {
  return STAGE_LABELS[stage];
}

export function pipelineStageIndex(stage: OnboardingPipelineStage): number {
  return P80_ONBOARDING_PIPELINE_STAGES.indexOf(stage);
}
