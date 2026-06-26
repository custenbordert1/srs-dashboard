import type {
  ReadyForWorkReadiness,
  ResolveOnboardingStateInput,
} from "@/lib/autonomous-onboarding-engine/types";
import type { TrainingAssignmentPreview } from "@/lib/autonomous-onboarding-engine/types";
import {
  isPaperworkSigned,
  resolveAutonomousOnboardingState,
} from "@/lib/autonomous-onboarding-engine/state-machine";

export function buildReadyForWorkReadiness(input: {
  candidateId: string;
  workflowStatus: string;
  paperworkStatus: string;
  paperworkError?: string | null;
  onboardingStatus?: string | null;
  training: TrainingAssignmentPreview;
  acknowledgementsComplete?: boolean;
  referenceAt?: string;
}): ReadyForWorkReadiness {
  const resolveInput: ResolveOnboardingStateInput = {
    candidateId: input.candidateId,
    workflowStatus: input.workflowStatus,
    paperworkStatus: input.paperworkStatus,
    paperworkError: input.paperworkError,
    onboardingStatus: input.onboardingStatus,
    trainingComplete: input.training.allRequiredComplete,
    acknowledgementsComplete: input.acknowledgementsComplete ?? input.training.allRequiredComplete,
  };

  const paperworkComplete = isPaperworkSigned(resolveInput);
  const trainingAssigned = input.training.assignedCount > 0;
  const trainingComplete = input.training.allRequiredComplete;
  const acknowledgementsComplete =
    input.acknowledgementsComplete ??
    input.training.modules
      .filter((row) => row.module.category === "acknowledgement")
      .every((row) => row.status === "complete");
  const noBlockingIssues = !input.paperworkError?.trim() && input.onboardingStatus !== "failed";

  const requirements: ReadyForWorkReadiness["requirements"] = [
    {
      id: "paperwork",
      label: "Paperwork complete",
      complete: paperworkComplete,
      blocking: true,
      detail: paperworkComplete ? null : "Awaiting signed onboarding paperwork.",
    },
    {
      id: "training_assigned",
      label: "Training assigned",
      complete: trainingAssigned,
      blocking: true,
      detail: trainingAssigned ? null : "Training modules not yet assigned.",
    },
    {
      id: "training_complete",
      label: "Training complete",
      complete: trainingComplete,
      blocking: true,
      detail: trainingComplete ? null : "One or more required training modules incomplete.",
    },
    {
      id: "acknowledgements",
      label: "Required acknowledgements complete",
      complete: acknowledgementsComplete,
      blocking: true,
      detail: acknowledgementsComplete ? null : "Safety or policy acknowledgements pending.",
    },
    {
      id: "no_blockers",
      label: "No blocking onboarding issues",
      complete: noBlockingIssues,
      blocking: true,
      detail: noBlockingIssues ? null : input.paperworkError ?? "Onboarding issue requires review.",
    },
  ];

  const missingRequirementLabels = requirements
    .filter((row) => row.blocking && !row.complete)
    .map((row) => row.label);
  const ready = missingRequirementLabels.length === 0;
  const state = resolveAutonomousOnboardingState({
    ...resolveInput,
    trainingComplete,
    acknowledgementsComplete,
  });

  return {
    candidateId: input.candidateId,
    status: ready || state === "ready_for_work" || state === "assigned" ? "ready_for_work" : "missing_requirements",
    requirements,
    missingRequirementLabels,
    readyAt: ready ? (input.referenceAt ?? new Date().toISOString()) : null,
  };
}
