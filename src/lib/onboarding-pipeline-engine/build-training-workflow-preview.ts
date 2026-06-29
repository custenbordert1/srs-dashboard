import type { OnboardingWorkspaceCandidateSnapshot } from "@/lib/autonomous-onboarding-engine/types";
import type { OnboardingDueDateSchedule } from "@/lib/onboarding-pipeline-engine/due-date-engine";
import type { TrainingWorkflowAssignment } from "@/lib/onboarding-pipeline-engine/types";

const ESTIMATED_MINUTES: Record<string, number> = {
  mel_test_survey: 20,
  store_call_training: 45,
  safety_acknowledgement: 10,
};

function stateLabel(
  status: TrainingWorkflowAssignment["status"],
): string {
  switch (status) {
    case "complete":
      return "Complete";
    case "in_progress":
      return "In Progress";
    case "assigned":
      return "Assigned";
    case "blocked":
      return "Blocked";
    default:
      return "Not Assigned";
  }
}

function resolveDueAt(moduleKey: string, schedule: OnboardingDueDateSchedule): string {
  if (moduleKey === "mel_test_survey") {
    return schedule.entries.find((row) => row.key === "mel_test")?.dueAt ?? schedule.anchorAt;
  }
  if (moduleKey === "store_call_training") {
    return schedule.entries.find((row) => row.key === "store_call")?.dueAt ?? schedule.anchorAt;
  }
  return schedule.entries.find((row) => row.key === "training_checklist")?.dueAt ?? schedule.anchorAt;
}

export function buildTrainingWorkflowAssignments(input: {
  snapshot: OnboardingWorkspaceCandidateSnapshot;
  schedule: OnboardingDueDateSchedule;
}): TrainingWorkflowAssignment[] {
  return input.snapshot.training.modules.map((row) => ({
    key: row.module.key,
    label: row.module.label,
    status: row.status,
    stateLabel: stateLabel(row.status),
    dueAt: resolveDueAt(row.module.key, input.schedule),
    estimatedCompletionMinutes: ESTIMATED_MINUTES[row.module.key] ?? 30,
    assignedAt: row.assignedAt,
    completedAt: row.completedAt,
    previewOnly: true as const,
  }));
}
