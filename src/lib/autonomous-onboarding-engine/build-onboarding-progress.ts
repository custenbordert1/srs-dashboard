import { listOnboardingProgressStepDefinitions } from "@/lib/autonomous-onboarding-engine/onboarding-progress-registry";
import { AUTONOMOUS_ONBOARDING_STATE_ORDER } from "@/lib/autonomous-onboarding-engine/state-machine";
import type {
  AutonomousOnboardingState,
  OnboardingProgressStepPreview,
  OnboardingProgressSummary,
  TrainingAssignmentPreview,
} from "@/lib/autonomous-onboarding-engine/types";

function lifecycleStepIndex(state: AutonomousOnboardingState): number {
  return AUTONOMOUS_ONBOARDING_STATE_ORDER.indexOf(state);
}

function isLifecycleStepComplete(
  stepState: AutonomousOnboardingState,
  currentState: AutonomousOnboardingState,
): boolean {
  if (currentState === "archived") return false;
  if (currentState === "assigned") return true;
  return lifecycleStepIndex(currentState) > lifecycleStepIndex(stepState);
}

function isTrainingStepComplete(moduleKey: string, training: TrainingAssignmentPreview): boolean {
  const module = training.modules.find((row) => row.module.key === moduleKey);
  return module?.status === "complete";
}

function progressBar(completed: number, total: number): string {
  const blocks = 10;
  const filled = total > 0 ? Math.round((completed / total) * blocks) : 0;
  return Array.from({ length: blocks }, (_, index) => (index < filled ? "█" : "░")).join(" ");
}

export function buildOnboardingProgressSummary(input: {
  currentState: AutonomousOnboardingState;
  training: TrainingAssignmentPreview;
}): OnboardingProgressSummary {
  const definitions = listOnboardingProgressStepDefinitions();
  const steps: OnboardingProgressStepPreview[] = definitions.map((definition) => {
    const complete =
      definition.kind === "lifecycle" && definition.lifecycleState
        ? isLifecycleStepComplete(definition.lifecycleState, input.currentState)
        : definition.trainingModuleKey
          ? isTrainingStepComplete(definition.trainingModuleKey, input.training)
          : false;

    return {
      id: definition.id,
      label: definition.label,
      kind: definition.kind,
      complete,
      current:
        definition.kind === "lifecycle" &&
        definition.lifecycleState === input.currentState &&
        input.currentState !== "assigned",
    };
  });

  const completedCount = steps.filter((row) => row.complete).length;
  const totalSteps = steps.length;
  const progressPercent = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

  return {
    progressPercent,
    completedCount,
    totalSteps,
    progressBar: progressBar(completedCount, totalSteps),
    steps,
  };
}
