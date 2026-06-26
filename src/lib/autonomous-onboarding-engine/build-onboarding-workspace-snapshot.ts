import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import { formatCandidateDisplayName } from "@/lib/candidate-display-name";
import { hooksForState } from "@/lib/autonomous-onboarding-engine/build-automation-hook-definitions";
import {
  buildOnboardingActivityTimeline,
  buildOnboardingLastActivity,
  buildOnboardingStallAssessment,
  resolveNextPlannedAutomation,
  resolveNextStepLabel,
} from "@/lib/autonomous-onboarding-engine/build-onboarding-activity-intelligence";
import { buildOnboardingProgressSummary } from "@/lib/autonomous-onboarding-engine/build-onboarding-progress";
import { buildReadyForWorkReadiness } from "@/lib/autonomous-onboarding-engine/build-ready-for-work-readiness";
import {
  buildTrainingAssignmentPreview,
  buildWelcomeEmailPreview,
} from "@/lib/autonomous-onboarding-engine/build-welcome-and-training-preview";
import {
  AUTONOMOUS_ONBOARDING_STATE_ORDER,
  resolveAutonomousOnboardingState,
  stateLabel,
} from "@/lib/autonomous-onboarding-engine/state-machine";
import {
  resolveRecruitingContactPhone,
  resolveWelcomeReplyToEmail,
} from "@/lib/autonomous-onboarding-engine/training-module-registry";
import type {
  OnboardingPreviewCandidateInput,
  OnboardingReminderPreview,
  OnboardingStepPreview,
  OnboardingTimelineEntry,
  OnboardingWorkspaceCandidateSnapshot,
} from "@/lib/autonomous-onboarding-engine/types";

function buildSteps(currentState: ReturnType<typeof resolveAutonomousOnboardingState>): {
  completed: OnboardingStepPreview[];
  remaining: OnboardingStepPreview[];
} {
  const currentIndex = AUTONOMOUS_ONBOARDING_STATE_ORDER.indexOf(
    AUTONOMOUS_ONBOARDING_STATE_ORDER.includes(currentState)
      ? currentState
      : "paperwork_pending",
  );

  const completed: OnboardingStepPreview[] = [];
  const remaining: OnboardingStepPreview[] = [];

  for (const [index, state] of AUTONOMOUS_ONBOARDING_STATE_ORDER.entries()) {
    if (state === "archived") continue;
    const step: OnboardingStepPreview = {
      id: state,
      label: stateLabel(state),
      complete: index < currentIndex,
      current: state === currentState,
      detail: null,
    };
    if (step.complete) completed.push(step);
    else remaining.push(step);
  }

  return { completed, remaining };
}

function buildTimeline(input: {
  row: OnboardingPreviewCandidateInput;
  onboarding: CandidateOnboardingRecord | null;
  currentState: ReturnType<typeof resolveAutonomousOnboardingState>;
}): OnboardingTimelineEntry[] {
  const entries: OnboardingTimelineEntry[] = [];

  if (input.row.appliedDate) {
    entries.push({
      id: "applied",
      at: input.row.appliedDate,
      label: "Application received",
      detail: null,
      state: "paperwork_pending",
    });
  }
  if (input.row.paperworkSentAt) {
    entries.push({
      id: "paperwork-sent",
      at: input.row.paperworkSentAt,
      label: "Paperwork sent",
      detail: input.row.signatureRequestId ?? null,
      state: "paperwork_sent",
    });
  }
  if (input.row.paperworkSignedAt) {
    entries.push({
      id: "paperwork-signed",
      at: input.row.paperworkSignedAt,
      label: "Paperwork signed",
      detail: null,
      state: "paperwork_signed",
    });
  }
  for (const history of input.onboarding?.statusHistory ?? []) {
    entries.push({
      id: `onboarding-${history.at}-${history.status}`,
      at: history.at,
      label: `Onboarding: ${history.status.replaceAll("_", " ")}`,
      detail: history.detail ?? null,
      state: null,
    });
  }
  if (input.currentState === "ready_for_work" || input.currentState === "assigned") {
    entries.push({
      id: "ready-preview",
      at: new Date().toISOString(),
      label: "Ready For Work (preview)",
      detail: "Readiness calculator satisfied in preview mode.",
      state: input.currentState,
    });
  }

  return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

function buildReminderSchedule(
  currentState: ReturnType<typeof resolveAutonomousOnboardingState>,
  referenceAt: string,
): OnboardingReminderPreview[] {
  if (currentState === "archived" || currentState === "assigned" || currentState === "ready_for_work") {
    return [];
  }

  const base = Date.parse(referenceAt);
  const reminders: OnboardingReminderPreview[] = [];

  if (currentState === "paperwork_sent") {
    reminders.push({
      id: "signature-nudge-1",
      label: "Paperwork signature reminder",
      scheduledFor: new Date(base + 24 * 60 * 60 * 1000).toISOString(),
      channel: "email",
      previewOnly: true,
    });
  }
  if (
    currentState === "training_assigned" ||
    currentState === "training_in_progress" ||
    currentState === "welcome_prepared"
  ) {
    reminders.push({
      id: "training-nudge-1",
      label: "Training completion reminder",
      scheduledFor: new Date(base + 48 * 60 * 60 * 1000).toISOString(),
      channel: "email",
      previewOnly: true,
    });
  }

  return reminders;
}

export function buildOnboardingWorkspaceCandidateSnapshot(input: {
  row: OnboardingPreviewCandidateInput;
  onboarding: CandidateOnboardingRecord | null;
  referenceAt?: string;
}): OnboardingWorkspaceCandidateSnapshot {
  const referenceAt = input.referenceAt ?? new Date().toISOString();
  const candidateName = formatCandidateDisplayName({
    firstName: input.row.firstName,
    lastName: input.row.lastName,
    email: input.row.email,
  });

  const training = buildTrainingAssignmentPreview({
    candidateId: input.row.candidateId,
    candidateName,
    workflowStatus: input.row.workflowStatus,
    paperworkStatus: input.row.paperworkStatus,
    onboardingStatus: input.onboarding?.status ?? null,
    referenceAt,
  });

  const readiness = buildReadyForWorkReadiness({
    candidateId: input.row.candidateId,
    workflowStatus: input.row.workflowStatus,
    paperworkStatus: input.row.paperworkStatus,
    paperworkError: input.row.paperworkError,
    onboardingStatus: input.onboarding?.status ?? null,
    training,
    referenceAt,
  });

  const currentState = resolveAutonomousOnboardingState({
    candidateId: input.row.candidateId,
    workflowStatus: input.row.workflowStatus,
    paperworkStatus: input.row.paperworkStatus,
    paperworkError: input.row.paperworkError,
    onboardingStatus: input.onboarding?.status ?? null,
    trainingComplete: training.allRequiredComplete,
    acknowledgementsComplete: training.modules
      .filter((row) => row.module.category === "acknowledgement")
      .every((row) => row.status === "complete"),
  });

  const welcomeEmail =
    currentState !== "paperwork_pending" &&
    currentState !== "paperwork_sent" &&
    currentState !== "archived"
      ? buildWelcomeEmailPreview({
          candidateId: input.row.candidateId,
          candidateName,
          email: input.row.email,
          assignedRecruiter: input.row.assignedRecruiter,
          training,
          replyTo: resolveWelcomeReplyToEmail(),
          contactPhone: resolveRecruitingContactPhone(),
        })
      : null;

  const { completed, remaining } = buildSteps(currentState);
  const referenceMs = Date.parse(referenceAt);
  const upcomingAutomations = hooksForState(currentState);
  const activityTimeline = buildOnboardingActivityTimeline({
    row: input.row,
    onboarding: input.onboarding,
    currentState,
    training,
  });
  const lastActivity = buildOnboardingLastActivity({ activityTimeline, referenceMs });
  const stall = buildOnboardingStallAssessment({
    currentState,
    readiness,
    lastActivity,
    paperworkError: input.row.paperworkError,
    onboardingStatus: input.onboarding?.status ?? null,
    referenceMs,
  });
  const progress = buildOnboardingProgressSummary({ currentState, training });

  return {
    candidateId: input.row.candidateId,
    candidateName,
    email: input.row.email?.trim() || null,
    assignedRecruiter: input.row.assignedRecruiter,
    previewMode: true,
    currentState,
    currentStateLabel: stateLabel(currentState),
    completedSteps: completed,
    remainingSteps: remaining,
    training,
    welcomeEmail,
    readiness,
    progress,
    lastActivity,
    activityTimeline,
    stall,
    nextStepLabel: resolveNextStepLabel({ currentState, training }),
    nextPlannedAutomation: resolveNextPlannedAutomation(upcomingAutomations),
    timeline: buildTimeline({ row: input.row, onboarding: input.onboarding, currentState }),
    upcomingAutomations,
    reminderSchedule: buildReminderSchedule(currentState, referenceAt),
  };
}

export function isAutonomousOnboardingPipelineCandidate(row: OnboardingPreviewCandidateInput): boolean {
  return (
    row.paperworkStatus === "sent" ||
    row.paperworkStatus === "viewed" ||
    row.paperworkStatus === "signed" ||
    row.workflowStatus === "Paperwork Sent" ||
    row.workflowStatus === "Signed" ||
    row.workflowStatus === "Awaiting DD Verification" ||
    row.workflowStatus === "Ready for MEL" ||
    row.workflowStatus === "Loaded in MEL" ||
    row.workflowStatus === "Training Needed" ||
    row.workflowStatus === "Active Rep"
  );
}
