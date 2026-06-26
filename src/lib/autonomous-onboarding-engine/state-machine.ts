import type {
  AutonomousOnboardingState,
  AutonomousOnboardingTransition,
  ResolveOnboardingStateInput,
} from "@/lib/autonomous-onboarding-engine/types";

const SIGNED_WORKFLOW = new Set([
  "Signed",
  "Awaiting DD Verification",
  "Ready for MEL",
  "Loaded in MEL",
  "Training Needed",
  "Active Rep",
]);

const SENT_WORKFLOW = new Set(["Paperwork Sent", ...SIGNED_WORKFLOW]);
const ARCHIVED_WORKFLOW = new Set(["Disqualified", "Withdrawn"]);
const ASSIGNED_WORKFLOW = new Set(["Active Rep"]);
const TRAINING_WORKFLOW = new Set(["Training Needed", "Loaded in MEL"]);
const POST_MEL_WORKFLOW = new Set(["Ready for MEL", "Loaded in MEL", "Training Needed", "Active Rep"]);

const SIGNED_PAPERWORK = new Set(["signed", "viewed"]);
const SENT_PAPERWORK = new Set(["sent", "viewed", "signed"]);

export const AUTONOMOUS_ONBOARDING_TRANSITIONS: AutonomousOnboardingTransition[] = [
  { from: "paperwork_pending", to: "paperwork_sent", trigger: "paperwork_sent", auditable: true },
  { from: "paperwork_sent", to: "paperwork_signed", trigger: "paperwork_signed", auditable: true },
  { from: "paperwork_signed", to: "welcome_prepared", trigger: "welcome_email_prepared", auditable: true },
  { from: "welcome_prepared", to: "training_assigned", trigger: "training_modules_assigned", auditable: true },
  { from: "training_assigned", to: "training_in_progress", trigger: "training_started", auditable: true },
  { from: "training_in_progress", to: "training_complete", trigger: "training_completed", auditable: true },
  { from: "training_complete", to: "ready_for_work", trigger: "readiness_satisfied", auditable: true },
  { from: "ready_for_work", to: "assigned", trigger: "project_assigned", auditable: true },
  { from: "paperwork_pending", to: "archived", trigger: "candidate_archived", auditable: true },
  { from: "paperwork_sent", to: "archived", trigger: "candidate_archived", auditable: true },
  { from: "paperwork_signed", to: "archived", trigger: "candidate_archived", auditable: true },
];

export function isPaperworkSigned(input: ResolveOnboardingStateInput): boolean {
  return (
    SIGNED_PAPERWORK.has(input.paperworkStatus) ||
    SIGNED_WORKFLOW.has(input.workflowStatus) ||
    input.onboardingStatus === "completed" ||
    input.onboardingStatus === "ready_for_mel"
  );
}

export function isPaperworkSent(input: ResolveOnboardingStateInput): boolean {
  return (
    SENT_PAPERWORK.has(input.paperworkStatus) ||
    SENT_WORKFLOW.has(input.workflowStatus) ||
    input.onboardingStatus === "sent" ||
    input.onboardingStatus === "viewed" ||
    input.onboardingStatus === "partially_completed"
  );
}

export function resolveAutonomousOnboardingState(
  input: ResolveOnboardingStateInput,
): AutonomousOnboardingState {
  if (
    ARCHIVED_WORKFLOW.has(input.workflowStatus) ||
    input.onboardingStatus === "declined" ||
    input.onboardingStatus === "expired" ||
    input.onboardingStatus === "failed"
  ) {
    return "archived";
  }

  if (ASSIGNED_WORKFLOW.has(input.workflowStatus)) {
    return "assigned";
  }

  const signed = isPaperworkSigned(input);
  const sent = isPaperworkSent(input);

  if (signed && input.trainingComplete && input.acknowledgementsComplete) {
    if (POST_MEL_WORKFLOW.has(input.workflowStatus)) return "ready_for_work";
    return "training_complete";
  }

  if (signed && TRAINING_WORKFLOW.has(input.workflowStatus)) {
    return input.trainingComplete ? "training_complete" : "training_in_progress";
  }

  if (signed && input.workflowStatus === "Ready for MEL") {
    return input.trainingComplete ? "training_complete" : "training_assigned";
  }

  if (signed) {
    return "welcome_prepared";
  }

  if (sent) return "paperwork_sent";
  return "paperwork_pending";
}

export function listValidTransitionsFrom(
  state: AutonomousOnboardingState,
): AutonomousOnboardingTransition[] {
  return AUTONOMOUS_ONBOARDING_TRANSITIONS.filter((row) => row.from === state);
}

export function stateLabel(state: AutonomousOnboardingState): string {
  const labels: Record<AutonomousOnboardingState, string> = {
    paperwork_pending: "Paperwork Pending",
    paperwork_sent: "Paperwork Sent",
    paperwork_signed: "Paperwork Signed",
    welcome_prepared: "Welcome Prepared",
    training_assigned: "Training Assigned",
    training_in_progress: "Training In Progress",
    training_complete: "Training Complete",
    ready_for_work: "Ready For Work",
    assigned: "Assigned",
    archived: "Archived",
  };
  return labels[state];
}

export const AUTONOMOUS_ONBOARDING_STATE_ORDER: AutonomousOnboardingState[] = [
  "paperwork_pending",
  "paperwork_sent",
  "paperwork_signed",
  "welcome_prepared",
  "training_assigned",
  "training_in_progress",
  "training_complete",
  "ready_for_work",
  "assigned",
];
