import { AUTONOMOUS_ONBOARDING_STATE_ORDER, stateLabel } from "@/lib/autonomous-onboarding-engine/state-machine";
import type { AutonomousOnboardingState } from "@/lib/autonomous-onboarding-engine/types";
import { listTrainingModules } from "@/lib/autonomous-onboarding-engine/training-module-registry";

export type OnboardingProgressStepKind = "lifecycle" | "training";

export type OnboardingProgressStepDefinition = {
  id: string;
  label: string;
  kind: OnboardingProgressStepKind;
  sortOrder: number;
  lifecycleState?: AutonomousOnboardingState;
  trainingModuleKey?: string;
};

const LIFECYCLE_PROGRESS_STATES: AutonomousOnboardingState[] = AUTONOMOUS_ONBOARDING_STATE_ORDER.filter(
  (state) => state !== "archived" && state !== "assigned",
);

export function listOnboardingProgressStepDefinitions(): OnboardingProgressStepDefinition[] {
  const lifecycle: OnboardingProgressStepDefinition[] = LIFECYCLE_PROGRESS_STATES.map((state, index) => ({
    id: state,
    label: stateLabel(state),
    kind: "lifecycle",
    sortOrder: index * 10,
    lifecycleState: state,
  }));

  const training: OnboardingProgressStepDefinition[] = listTrainingModules().map((module) => ({
    id: `training:${module.key}`,
    label: `${module.label} Completed`,
    kind: "training",
    sortOrder: 100 + module.sortOrder,
    trainingModuleKey: module.key,
  }));

  return [...lifecycle, ...training].sort((a, b) => a.sortOrder - b.sortOrder);
}
