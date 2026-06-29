import type { OnboardingWorkspaceCandidateSnapshot } from "@/lib/autonomous-onboarding-engine/types";
import { daysBetween, isOverdue } from "@/lib/onboarding-pipeline-engine/due-date-engine";
import type { OnboardingDueDateSchedule } from "@/lib/onboarding-pipeline-engine/due-date-engine";
import type { OnboardingPipelineStage } from "@/lib/onboarding-pipeline-engine/types";
import type { OnboardingPipelineRecruiterAction } from "@/lib/onboarding-pipeline-engine/types";

function recruiterAction(
  partial: Omit<OnboardingPipelineRecruiterAction, "previewOnly"> & { sortOrder: number },
): OnboardingPipelineRecruiterAction & { sortOrder: number } {
  return { ...partial, previewOnly: true };
}

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

export function buildPrioritizedRecruiterActions(input: {
  snapshot: OnboardingWorkspaceCandidateSnapshot;
  stage: OnboardingPipelineStage;
  schedule: OnboardingDueDateSchedule;
  referenceAt: string;
  stalled: boolean;
  waitingDays: number;
}): OnboardingPipelineRecruiterAction[] {
  const actions: Array<OnboardingPipelineRecruiterAction & { sortOrder: number }> = [];
  const inactiveDays =
    input.snapshot.stall.inactiveMs != null
      ? Math.floor(input.snapshot.stall.inactiveMs / (24 * 60 * 60 * 1000))
      : input.waitingDays;

  if (input.stage === "paperwork_complete" || input.stage === "welcome_email_ready") {
    actions.push(
      recruiterAction({
        id: "send-welcome-email",
        label: "Send Welcome Email (Preview)",
        description: `Generate and review welcome email for ${input.snapshot.candidateName}.`,
        priority: "high",
        sortOrder: 10,
      }),
    );
  }

  if (
    input.stage === "welcome_email_ready" ||
    input.stage === "mel_test_assigned" ||
    input.stage === "training_pending"
  ) {
    actions.push(
      recruiterAction({
        id: "assign-mel-test",
        label: "Assign MEL Test (Preview)",
        description: "Preview MEL Test Survey assignment — no MEL writes.",
        priority: input.stage === "welcome_email_ready" ? "high" : "medium",
        sortOrder: 20,
      }),
    );
  }

  if (
    input.stage === "mel_test_assigned" ||
    input.stage === "store_call_assigned" ||
    input.stage === "training_pending"
  ) {
    actions.push(
      recruiterAction({
        id: "schedule-store-call",
        label: "Schedule Store Call (Preview)",
        description: "Preview store call training assignment and scheduling.",
        priority: "medium",
        sortOrder: 30,
      }),
    );
  }

  if (inactiveDays >= 3 || input.stalled) {
    actions.push(
      recruiterAction({
        id: "candidate-waiting",
        label: `Candidate waiting ${inactiveDays || 3}+ days`,
        description: input.snapshot.stall.reason || "Follow up on stalled onboarding progress.",
        priority: inactiveDays >= 5 || input.snapshot.stall.level === "blocked" ? "high" : "medium",
        sortOrder: 5,
      }),
    );
  }

  const currentDue =
    input.schedule.entries.find((row) => {
      if (input.stage === "welcome_email_ready") return row.key === "welcome_email";
      if (input.stage === "mel_test_assigned") return row.key === "mel_test";
      if (input.stage === "store_call_assigned") return row.key === "store_call";
      if (input.stage === "training_pending") return row.key === "training_checklist";
      return false;
    })?.dueAt ?? null;

  if (currentDue && isOverdue(currentDue, input.referenceAt)) {
    actions.push(
      recruiterAction({
        id: "overdue-step",
        label: "Overdue onboarding step (Preview)",
        description: "Current onboarding step is past its estimated due date.",
        priority: "high",
        sortOrder: 1,
      }),
    );
  }

  if (input.stage === "ready_for_work" || input.snapshot.readiness.status === "ready_for_work") {
    actions.push(
      recruiterAction({
        id: "ready-for-work",
        label: "Ready for Work",
        description: "Preview DM notification and project handoff.",
        priority: "low",
        sortOrder: 40,
      }),
    );
  }

  if (input.stalled && input.snapshot.stall.level === "blocked") {
    actions.push(
      recruiterAction({
        id: "escalate-stall",
        label: "Preview stall escalation",
        description: "Escalate stalled onboarding to recruiting lead for manual review.",
        priority: "high",
        sortOrder: 2,
      }),
    );
  }

  return actions
    .sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.sortOrder - b.sortOrder,
    )
    .map(({ sortOrder: _sortOrder, ...action }) => action);
}

export function buildWaitingDays(input: {
  paperworkSignedAt: string | null;
  referenceAt: string;
}): number {
  if (!input.paperworkSignedAt) return 0;
  return daysBetween(input.paperworkSignedAt, input.referenceAt);
}
