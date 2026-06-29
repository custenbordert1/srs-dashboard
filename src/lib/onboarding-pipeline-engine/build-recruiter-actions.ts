import type { OnboardingWorkspaceCandidateSnapshot } from "@/lib/autonomous-onboarding-engine/types";
import type { OnboardingPipelineRecruiterAction } from "@/lib/onboarding-pipeline-engine/types";

function recruiterAction(
  partial: Omit<OnboardingPipelineRecruiterAction, "previewOnly">,
): OnboardingPipelineRecruiterAction {
  return { ...partial, previewOnly: true };
}

export function buildOnboardingPipelineRecruiterActions(input: {
  snapshot: OnboardingWorkspaceCandidateSnapshot;
  stalled: boolean;
}): OnboardingPipelineRecruiterAction[] {
  if (!input.stalled) return [];

  const { snapshot } = input;
  const actions: OnboardingPipelineRecruiterAction[] = [];

  actions.push(
    recruiterAction({
      id: "nudge-candidate",
      label: "Preview candidate nudge",
      description: `Send follow-up to ${snapshot.candidateName} about stalled onboarding step.`,
      priority: snapshot.stall.level === "blocked" ? "high" : "medium",
    }),
  );

  if (snapshot.stall.level === "blocked" || snapshot.stall.level === "high_risk") {
    actions.push(
      recruiterAction({
        id: "escalate-stall",
        label: "Preview stall escalation",
        description: "Escalate stalled onboarding to recruiting lead for manual review.",
        priority: "high",
      }),
    );
  }

  if (
    snapshot.currentState === "training_in_progress" ||
    snapshot.currentState === "training_assigned"
  ) {
    actions.push(
      recruiterAction({
        id: "training-check-in",
        label: "Preview training check-in",
        description: "Schedule recruiter check-in on incomplete training modules.",
        priority: "medium",
      }),
    );
  }

  if (snapshot.readiness.status === "ready_for_work") {
    actions.push(
      recruiterAction({
        id: "preview-dm-handoff",
        label: "Preview DM handoff",
        description: "Preview district manager notification for project assignment.",
        priority: "low",
      }),
    );
  }

  return actions;
}
