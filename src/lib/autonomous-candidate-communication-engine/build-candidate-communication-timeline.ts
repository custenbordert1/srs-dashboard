import { formatCandidateDisplayName } from "@/lib/candidate-display-name";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type {
  CommunicationDecision,
  CommunicationTimelineStep,
} from "@/lib/autonomous-candidate-communication-engine/types";

function workflowTimelineSteps(row: ScoredCandidateWorkflowRow): CommunicationTimelineStep[] {
  const steps: CommunicationTimelineStep[] = [];

  if (row.appliedDate) {
    steps.push({
      id: "applied",
      at: row.appliedDate,
      label: "Application received",
      communicationType: null,
      detail: null,
      status: "completed",
    });
  }

  if (row.actionGeneratedAt) {
    steps.push({
      id: "approved",
      at: row.actionGeneratedAt,
      label: "Candidate approved",
      communicationType: null,
      detail: row.assignedRecruiter ? `Recruiter: ${row.assignedRecruiter}` : null,
      status: "completed",
    });
  }

  if (row.paperworkSentAt) {
    steps.push({
      id: "paperwork-sent",
      at: row.paperworkSentAt,
      label: "Paperwork sent",
      communicationType: "paperwork_sent",
      detail: null,
      status: "completed",
    });
  }

  if (row.paperworkSignedAt) {
    steps.push({
      id: "paperwork-signed",
      at: row.paperworkSignedAt,
      label: "Paperwork signed",
      communicationType: "paperwork_completed",
      detail: null,
      status: "completed",
    });
  } else if (row.paperworkSentAt) {
    steps.push({
      id: "waiting-signature",
      at: row.paperworkSentAt,
      label: "Waiting signature",
      communicationType: null,
      detail: "Pending candidate signature",
      status: "pending",
    });
  }

  for (const event of row.history ?? []) {
    if (event.type === "note" || event.type === "follow_up") {
      steps.push({
        id: `history-${event.id}`,
        at: event.createdAt,
        label: event.type === "follow_up" ? "Follow-up logged" : "Note",
        communicationType: event.type === "follow_up" ? "recruiter_follow_up" : null,
        detail: event.message,
        status: "completed",
      });
    }
  }

  return steps;
}

export function buildCandidateCommunicationTimeline(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  decisions: CommunicationDecision[];
}): CommunicationTimelineStep[] {
  const workflowSteps = workflowTimelineSteps(input.row);

  const communicationSteps = input.decisions
    .filter((decision) => !decision.skipped)
    .map((decision) => ({
      id: `comm-${decision.decisionId}`,
      at: decision.scheduledAt,
      label: `${decision.communicationType.replace(/_/g, " ")} generated`,
      communicationType: decision.communicationType,
      detail: `${decision.recipientRole}: ${decision.recipientLabel} — ${decision.explanation}`,
      status: decision.approvalRequired
        ? ("scheduled" as const)
        : decision.wouldSend
          ? ("simulated" as const)
          : ("pending" as const),
    }));

  const reminderSteps = input.decisions
    .filter((d) => d.communicationType.startsWith("reminder") || d.communicationType === "final_reminder")
    .map((decision) => ({
      id: `reminder-${decision.decisionId}`,
      at: decision.scheduledAt,
      label: "Reminder scheduled",
      communicationType: decision.communicationType,
      detail: decision.explanation,
      status: "scheduled" as const,
    }));

  return [...workflowSteps, ...communicationSteps, ...reminderSteps].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );
}

export function buildSampleCommunicationTimeline(input: {
  row: ScoredCandidateWorkflowRow | null;
  decisions: CommunicationDecision[];
}): CommunicationTimelineStep[] {
  if (!input.row) {
    return input.decisions.slice(0, 5).map((decision) => ({
      id: decision.decisionId,
      at: decision.scheduledAt,
      label: decision.communicationType.replace(/_/g, " "),
      communicationType: decision.communicationType,
      detail: decision.candidateName ?? decision.explanation,
      status: "simulated" as const,
    }));
  }

  return buildCandidateCommunicationTimeline({
    row: input.row,
    onboarding: null,
    decisions: input.decisions.slice(0, 8),
  });
}
