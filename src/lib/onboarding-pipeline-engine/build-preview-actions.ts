import type { OnboardingWorkspaceCandidateSnapshot } from "@/lib/autonomous-onboarding-engine/types";
import type {
  OnboardingPipelinePreviewAction,
  OnboardingPipelineStage,
} from "@/lib/onboarding-pipeline-engine/types";

function action(
  partial: Omit<OnboardingPipelinePreviewAction, "previewOnly">,
): OnboardingPipelinePreviewAction {
  return { ...partial, previewOnly: true };
}

export function buildOnboardingPipelinePreviewActions(input: {
  stage: OnboardingPipelineStage;
  snapshot: OnboardingWorkspaceCandidateSnapshot;
}): OnboardingPipelinePreviewAction[] {
  const actions: OnboardingPipelinePreviewAction[] = [];
  const { stage, snapshot } = input;

  if (stage === "paperwork_complete" || stage === "welcome_email_ready") {
    actions.push(
      action({
        id: "preview-welcome-email",
        kind: "welcome_email",
        label: "Preview welcome email",
        description: "Draft onboarding welcome email with training instructions.",
        status: snapshot.welcomeEmail ? "ready" : "scheduled",
        detail: snapshot.welcomeEmail?.subject ?? "Welcome email will be generated on automation trigger.",
      }),
    );
  }

  if (
    stage === "welcome_email_ready" ||
    stage === "mel_test_assigned" ||
    stage === "store_call_assigned" ||
    stage === "training_pending"
  ) {
    const mel = snapshot.training.modules.find((row) => row.module.key === "mel_test_survey");
    actions.push(
      action({
        id: "preview-mel-test",
        kind: "mel_test_assignment",
        label: "Preview MEL test assignment",
        description: "Simulate MEL Test Survey assignment — no MEL writes.",
        status: mel?.status === "complete" ? "ready" : mel?.url ? "ready" : "blocked",
        detail: mel?.module.label ?? "MEL Test Survey",
      }),
    );
  }

  if (
    stage === "mel_test_assigned" ||
    stage === "store_call_assigned" ||
    stage === "training_pending"
  ) {
    const store = snapshot.training.modules.find((row) => row.module.key === "store_call_training");
    actions.push(
      action({
        id: "preview-store-call",
        kind: "store_call_assignment",
        label: "Preview store call assignment",
        description: "Simulate Store Call Training assignment — preview only.",
        status: store?.status === "complete" ? "ready" : store?.url ? "ready" : "blocked",
        detail: store?.module.label ?? "Store Call Training",
      }),
    );
  }

  if (stage === "training_pending") {
    actions.push(
      action({
        id: "preview-training-reminder",
        kind: "training_reminder",
        label: "Preview training reminder",
        description: "Simulate reminder cadence for incomplete training modules.",
        status: snapshot.stall.level === "normal" ? "scheduled" : "ready",
        detail:
          snapshot.reminderSchedule[0]?.label ??
          "Reminder schedule will activate when training is in progress.",
      }),
    );
  }

  if (stage === "ready_for_work") {
    actions.push(
      action({
        id: "preview-dm-notification",
        kind: "dm_notification",
        label: "Preview DM notification",
        description: "Simulate district manager alert for ready-for-work representative.",
        status: "ready",
        detail: `Notify DM that ${snapshot.candidateName} is ready for project assignment.`,
      }),
    );
  }

  return actions;
}
