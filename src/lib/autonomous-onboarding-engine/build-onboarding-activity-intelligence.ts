import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { AutomationHookDefinition } from "@/lib/autonomous-onboarding-engine/types";
import type {
  AutonomousOnboardingState,
  OnboardingActivityTimelineEntry,
  OnboardingLastActivity,
  OnboardingPreviewCandidateInput,
  OnboardingStallAssessment,
  ReadyForWorkReadiness,
  TrainingAssignmentPreview,
} from "@/lib/autonomous-onboarding-engine/types";
import { stateLabel } from "@/lib/autonomous-onboarding-engine/state-machine";

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export function formatElapsedSince(iso: string | null, referenceMs: number): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const diffMs = Math.max(0, referenceMs - at);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

function buildPreviewAutomationEvents(input: {
  row: OnboardingPreviewCandidateInput;
  currentState: AutonomousOnboardingState;
  training: TrainingAssignmentPreview;
}): OnboardingActivityTimelineEntry[] {
  const entries: OnboardingActivityTimelineEntry[] = [];

  if (input.row.paperworkSentAt) {
    entries.push({
      id: "activity-paperwork-sent",
      at: input.row.paperworkSentAt,
      label: "Paperwork Sent",
      stepName: "Paperwork Sent",
      status: "completed",
      detail: input.row.signatureRequestId ?? null,
    });
  }

  if (input.row.paperworkSignedAt) {
    entries.push({
      id: "activity-paperwork-signed",
      at: input.row.paperworkSignedAt,
      label: "Paperwork Signed",
      stepName: "Paperwork Signed",
      status: "completed",
      detail: null,
    });

    const welcomeAt = addMinutes(input.row.paperworkSignedAt, 1);
    entries.push({
      id: "activity-welcome-generated",
      at: welcomeAt,
      label: "Welcome Generated",
      stepName: "Welcome Generated",
      status: "completed",
      detail: "Preview welcome email drafted.",
    });

    entries.push({
      id: "activity-training-assigned",
      at: addMinutes(input.row.paperworkSignedAt, 2),
      label: "Training Assigned",
      stepName: "Training Assigned",
      status: "completed",
      detail: null,
    });
  }

  for (const module of input.training.modules) {
    if (module.status === "complete" && module.completedAt) {
      entries.push({
        id: `activity-training-${module.module.key}`,
        at: module.completedAt,
        label: `${module.module.label} Completed`,
        stepName: module.module.label,
        status: "completed",
        detail: null,
      });
    }
  }

  if (input.currentState === "ready_for_work" || input.currentState === "assigned") {
    entries.push({
      id: "activity-ready-for-work",
      at: input.row.paperworkSignedAt ? addMinutes(input.row.paperworkSignedAt, 180) : null,
      label: "Ready For Work",
      stepName: "Ready For Work",
      status: "completed",
      detail: "Preview readiness satisfied.",
    });
  }

  return entries;
}

function resolveWaitingStep(input: {
  currentState: AutonomousOnboardingState;
  training: TrainingAssignmentPreview;
}): OnboardingActivityTimelineEntry | null {
  if (input.currentState === "paperwork_sent") {
    return {
      id: "activity-waiting-signature",
      at: null,
      label: "Waiting for paperwork signature",
      stepName: "Paperwork Signed",
      status: "current",
      detail: null,
    };
  }

  const pendingModule = input.training.modules.find(
    (row) => row.status === "assigned" || row.status === "in_progress",
  );
  if (pendingModule) {
    return {
      id: `activity-waiting-${pendingModule.module.key}`,
      at: null,
      label: `Waiting for ${pendingModule.module.label}`,
      stepName: pendingModule.module.label,
      status: "current",
      detail: null,
    };
  }

  if (input.currentState === "welcome_prepared") {
    return {
      id: "activity-waiting-training-assign",
      at: null,
      label: "Waiting for training assignment",
      stepName: "Training Assigned",
      status: "current",
      detail: null,
    };
  }

  if (input.currentState === "training_complete") {
    return {
      id: "activity-waiting-ready-check",
      at: null,
      label: "Waiting for Ready For Work check",
      stepName: "Ready For Work",
      status: "current",
      detail: null,
    };
  }

  return null;
}

export function buildOnboardingActivityTimeline(input: {
  row: OnboardingPreviewCandidateInput;
  onboarding: CandidateOnboardingRecord | null;
  currentState: AutonomousOnboardingState;
  training: TrainingAssignmentPreview;
}): OnboardingActivityTimelineEntry[] {
  const entries = buildPreviewAutomationEvents(input);

  for (const history of input.onboarding?.statusHistory ?? []) {
    if (history.status === "sent" || history.status === "completed") continue;
    entries.push({
      id: `activity-onboarding-${history.at}-${history.status}`,
      at: history.at,
      label: history.status.replaceAll("_", " "),
      stepName: history.status.replaceAll("_", " "),
      status: "completed",
      detail: history.detail ?? null,
    });
  }

  const waiting = resolveWaitingStep(input);
  if (waiting) entries.push(waiting);

  return entries.sort((a, b) => {
    if (!a.at && !b.at) return 0;
    if (!a.at) return 1;
    if (!b.at) return -1;
    return Date.parse(a.at) - Date.parse(b.at);
  });
}

export function buildOnboardingLastActivity(input: {
  activityTimeline: OnboardingActivityTimelineEntry[];
  referenceMs: number;
}): OnboardingLastActivity | null {
  const completed = input.activityTimeline
    .filter((row) => row.status === "completed" && row.at)
    .sort((a, b) => Date.parse(b.at!) - Date.parse(a.at!));

  const latest = completed[0];
  if (!latest?.at) return null;

  return {
    label: latest.label,
    stepName: latest.stepName,
    completedAt: latest.at,
    elapsedLabel: formatElapsedSince(latest.at, input.referenceMs),
    elapsedMs: Math.max(0, input.referenceMs - Date.parse(latest.at)),
  };
}

export function buildOnboardingStallAssessment(input: {
  currentState: AutonomousOnboardingState;
  readiness: ReadyForWorkReadiness;
  lastActivity: OnboardingLastActivity | null;
  paperworkError?: string | null;
  onboardingStatus?: string | null;
  referenceMs: number;
}): OnboardingStallAssessment {
  const hasPaperworkError = Boolean(input.paperworkError?.trim());
  const onboardingFailed = input.onboardingStatus === "failed";
  const paperworkRequirement = input.readiness.requirements.find((row) => row.id === "paperwork");
  const noBlockersRequirement = input.readiness.requirements.find((row) => row.id === "no_blockers");
  const paperworkStuck =
    paperworkRequirement?.blocking === true &&
    !paperworkRequirement.complete &&
    (input.currentState === "paperwork_sent" || input.currentState === "paperwork_pending");

  if (hasPaperworkError || onboardingFailed || paperworkStuck || noBlockersRequirement?.complete === false) {
    return {
      level: "blocked",
      label: "Blocked",
      reason:
        input.paperworkError ??
        (onboardingFailed ? "Onboarding record failed." : null) ??
        paperworkRequirement?.detail ??
        noBlockersRequirement?.detail ??
        "Missing required onboarding step.",
      inactiveMs: input.lastActivity?.elapsedMs ?? null,
    };
  }

  if (input.currentState === "assigned" || input.currentState === "ready_for_work") {
    return {
      level: "normal",
      label: "Normal",
      reason: "Onboarding complete or awaiting assignment handoff.",
      inactiveMs: input.lastActivity?.elapsedMs ?? null,
    };
  }

  const inactiveMs = input.lastActivity?.elapsedMs ?? null;
  if (inactiveMs == null) {
    return {
      level: "needs_attention",
      label: "Needs Attention",
      reason: "No completed onboarding activity recorded yet.",
      inactiveMs: null,
    };
  }

  if (inactiveMs >= 5 * MS_PER_DAY) {
    return {
      level: "high_risk",
      label: "High Risk",
      reason: "No progress in 5+ days.",
      inactiveMs,
    };
  }

  if (inactiveMs >= 2 * MS_PER_DAY) {
    return {
      level: "needs_attention",
      label: "Needs Attention",
      reason: "No progress in 2+ days.",
      inactiveMs,
    };
  }

  return {
    level: "normal",
    label: "Normal",
    reason: "Last activity within 24 hours.",
    inactiveMs,
  };
}

export function resolveNextPlannedAutomation(
  hooks: AutomationHookDefinition[],
): AutomationHookDefinition | null {
  return hooks.find((hook) => hook.status === "preview" || hook.status === "defined") ?? null;
}

export function resolveNextStepLabel(input: {
  currentState: AutonomousOnboardingState;
  training: TrainingAssignmentPreview;
}): string {
  const waiting = resolveWaitingStep(input);
  if (waiting) return waiting.stepName;
  return stateLabel(input.currentState);
}
