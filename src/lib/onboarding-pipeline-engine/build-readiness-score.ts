import type { OnboardingWorkspaceCandidateSnapshot } from "@/lib/autonomous-onboarding-engine/types";
import type { OnboardingPipelineStage } from "@/lib/onboarding-pipeline-engine/types";
import type { OnboardingReadinessScore } from "@/lib/onboarding-pipeline-engine/types";

type ReadinessFactor = {
  id: string;
  label: string;
  weight: number;
  complete: boolean;
};

function isMelComplete(snapshot: OnboardingWorkspaceCandidateSnapshot): boolean {
  return (
    snapshot.training.modules.find((row) => row.module.key === "mel_test_survey")?.status === "complete"
  );
}

function isStoreCallComplete(snapshot: OnboardingWorkspaceCandidateSnapshot): boolean {
  return (
    snapshot.training.modules.find((row) => row.module.key === "store_call_training")?.status ===
    "complete"
  );
}

function isTrainingComplete(snapshot: OnboardingWorkspaceCandidateSnapshot): boolean {
  return snapshot.training.allRequiredComplete;
}

export function buildOnboardingReadinessScore(input: {
  snapshot: OnboardingWorkspaceCandidateSnapshot;
  stage: OnboardingPipelineStage;
  welcomeGenerated: boolean;
}): OnboardingReadinessScore {
  const factors: ReadinessFactor[] = [
    {
      id: "paperwork_complete",
      label: "Paperwork complete",
      weight: 20,
      complete: true,
    },
    {
      id: "welcome_generated",
      label: "Welcome email generated",
      weight: 15,
      complete: input.welcomeGenerated,
    },
    {
      id: "mel_assigned",
      label: "MEL test assigned",
      weight: 15,
      complete: isMelComplete(input.snapshot) || pipelinePast(input.stage, "mel_test_assigned"),
    },
    {
      id: "store_call_assigned",
      label: "Store call assigned",
      weight: 15,
      complete: isStoreCallComplete(input.snapshot) || pipelinePast(input.stage, "store_call_assigned"),
    },
    {
      id: "training_complete",
      label: "Training complete",
      weight: 20,
      complete: isTrainingComplete(input.snapshot),
    },
    {
      id: "ready_for_work",
      label: "Ready for work",
      weight: 15,
      complete: input.stage === "ready_for_work" || input.snapshot.readiness.status === "ready_for_work",
    },
  ];

  const earned = factors.filter((row) => row.complete).reduce((sum, row) => sum + row.weight, 0);
  const blockers = [
    ...input.snapshot.readiness.missingRequirementLabels,
    ...factors.filter((row) => !row.complete).map((row) => row.label),
  ];
  const uniqueBlockers = [...new Set(blockers)].filter(
    (label) => !label.toLowerCase().includes("paperwork complete"),
  );

  const confidenceBase = 55;
  const confidenceBoost =
    (input.snapshot.email ? 15 : 0) +
    (input.snapshot.assignedRecruiter !== "Unassigned" ? 15 : 0) +
    (input.snapshot.training.modules.every((row) => row.url || row.status === "complete") ? 15 : 0);

  return {
    score: earned,
    confidence: Math.min(100, confidenceBase + confidenceBoost),
    blockers: input.stage === "ready_for_work" ? [] : uniqueBlockers.slice(0, 5),
    factors: factors.map((row) => ({
      id: row.id,
      label: row.label,
      complete: row.complete,
      weight: row.weight,
    })),
  };
}

function pipelinePast(stage: OnboardingPipelineStage, target: OnboardingPipelineStage): boolean {
  const order = [
    "paperwork_complete",
    "welcome_email_ready",
    "mel_test_assigned",
    "store_call_assigned",
    "training_pending",
    "ready_for_work",
  ] as const;
  return order.indexOf(stage) > order.indexOf(target);
}
