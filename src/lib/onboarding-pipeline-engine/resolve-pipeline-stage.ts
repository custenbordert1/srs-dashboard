import type { OnboardingWorkspaceCandidateSnapshot } from "@/lib/autonomous-onboarding-engine/types";
import {
  P80_ONBOARDING_PIPELINE_STAGES,
  pipelineStageIndex,
} from "@/lib/onboarding-pipeline-engine/stages";
import type { OnboardingPipelineStage } from "@/lib/onboarding-pipeline-engine/types";

function moduleStatus(
  snapshot: OnboardingWorkspaceCandidateSnapshot,
  key: string,
): "not_assigned" | "assigned" | "in_progress" | "complete" | "blocked" {
  const row = snapshot.training.modules.find((module) => module.module.key === key);
  if (!row) return "not_assigned";
  return row.status;
}

export function resolveOnboardingPipelineStage(
  snapshot: OnboardingWorkspaceCandidateSnapshot,
): OnboardingPipelineStage {
  if (
    snapshot.readiness.status === "ready_for_work" ||
    snapshot.currentState === "ready_for_work" ||
    snapshot.currentState === "assigned"
  ) {
    return "ready_for_work";
  }

  if (
    snapshot.currentState === "training_in_progress" ||
    snapshot.currentState === "training_complete"
  ) {
    return "training_pending";
  }

  const storeCall = moduleStatus(snapshot, "store_call_training");
  if (storeCall === "assigned" || storeCall === "in_progress" || storeCall === "complete") {
    return "store_call_assigned";
  }

  const melTest = moduleStatus(snapshot, "mel_test_survey");
  if (melTest === "assigned" || melTest === "in_progress" || melTest === "complete") {
    return "mel_test_assigned";
  }

  if (
    snapshot.currentState === "welcome_prepared" ||
    snapshot.currentState === "training_assigned" ||
    snapshot.welcomeEmail
  ) {
    return "welcome_email_ready";
  }

  return "paperwork_complete";
}

export function buildCompletedPipelineStages(stage: OnboardingPipelineStage): OnboardingPipelineStage[] {
  if (stage === "ready_for_work") {
    return [...P80_ONBOARDING_PIPELINE_STAGES];
  }
  const index = pipelineStageIndex(stage);
  return P80_ONBOARDING_PIPELINE_STAGES.slice(0, index) as OnboardingPipelineStage[];
}

export function buildPipelineProgressPercent(stage: OnboardingPipelineStage): number {
  const completed = buildCompletedPipelineStages(stage);
  return Math.round((completed.length / P80_ONBOARDING_PIPELINE_STAGES.length) * 100);
}
