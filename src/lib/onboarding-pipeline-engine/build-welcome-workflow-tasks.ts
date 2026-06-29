import type { OnboardingWorkspaceCandidateSnapshot } from "@/lib/autonomous-onboarding-engine/types";
import type { OnboardingDueDateSchedule } from "@/lib/onboarding-pipeline-engine/due-date-engine";
import { pipelineStageIndex } from "@/lib/onboarding-pipeline-engine/stages";
import type { OnboardingPipelineStage } from "@/lib/onboarding-pipeline-engine/types";
import type { WelcomeWorkflowTask } from "@/lib/onboarding-pipeline-engine/types";

type TaskDefinition = {
  id: string;
  stage: OnboardingPipelineStage;
  label: string;
  description: string;
  dueKey: "welcome_email" | "mel_test" | "store_call" | "training_checklist" | "ready_for_work";
  estimatedMinutes: number;
};

const WORKFLOW_TASK_DEFINITIONS: TaskDefinition[] = [
  {
    id: "generate-welcome-email",
    stage: "welcome_email_ready",
    label: "Generate Welcome Email",
    description: "Draft onboarding welcome email with recruiter and project context.",
    dueKey: "welcome_email",
    estimatedMinutes: 5,
  },
  {
    id: "assign-mel-test",
    stage: "mel_test_assigned",
    label: "Assign MEL Test",
    description: "Preview MEL Test Survey assignment — no MEL writes.",
    dueKey: "mel_test",
    estimatedMinutes: 10,
  },
  {
    id: "assign-store-call",
    stage: "store_call_assigned",
    label: "Assign Store Call",
    description: "Preview Store Call Training assignment.",
    dueKey: "store_call",
    estimatedMinutes: 10,
  },
  {
    id: "assign-training-checklist",
    stage: "training_pending",
    label: "Assign Training Checklist",
    description: "Generate preview training checklist and acknowledgement tasks.",
    dueKey: "training_checklist",
    estimatedMinutes: 15,
  },
  {
    id: "ready-for-work-check",
    stage: "ready_for_work",
    label: "Ready for Work",
    description: "Run readiness check and preview DM handoff.",
    dueKey: "ready_for_work",
    estimatedMinutes: 5,
  },
];

function resolveTaskStatus(
  taskStage: OnboardingPipelineStage,
  currentStage: OnboardingPipelineStage,
): WelcomeWorkflowTask["status"] {
  const taskIndex = pipelineStageIndex(taskStage);
  const currentIndex = pipelineStageIndex(currentStage);

  if (currentStage === "ready_for_work") return "completed";
  if (taskIndex < currentIndex) return "completed";
  if (taskIndex === currentIndex) return "ready";
  return "pending";
}

export function buildWelcomeWorkflowTasks(input: {
  currentStage: OnboardingPipelineStage;
  snapshot: OnboardingWorkspaceCandidateSnapshot;
  schedule: OnboardingDueDateSchedule;
}): WelcomeWorkflowTask[] {
  return WORKFLOW_TASK_DEFINITIONS.map((definition) => {
    const dueAt =
      input.schedule.entries.find((row) => row.key === definition.dueKey)?.dueAt ??
      input.schedule.estimatedReadyForWorkAt;
    const status = resolveTaskStatus(definition.stage, input.currentStage);
    const blocked =
      definition.id === "assign-mel-test" &&
      input.snapshot.training.modules.some(
        (row) => row.module.key === "mel_test_survey" && !row.url && row.status !== "complete",
      );

    return {
      id: definition.id,
      stage: definition.stage,
      label: definition.label,
      description: definition.description,
      dueAt,
      estimatedMinutes: definition.estimatedMinutes,
      status: blocked && status !== "completed" ? "blocked" : status,
      previewOnly: true,
    };
  });
}
