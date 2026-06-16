import type { CandidateQueueActionPayload } from "@/lib/candidate-queue-actions";
import type { RecruiterOneClickActionId, OneClickWorkflowUpdate } from "@/lib/recruiter-action-center/types";

export const ONE_CLICK_ACTION_LABELS: Record<RecruiterOneClickActionId, string> = {
  "assign-me": "Assign Me",
  contacted: "Contacted",
  "send-paperwork": "Send Paperwork",
  "follow-up-complete": "Follow-Up Complete",
  "ready-for-mel": "Ready for MEL",
  "schedule-follow-up": "Schedule Follow-Up",
  "close-candidate": "Close Candidate",
  escalate: "Escalate",
};

export function resolveOneClickActionsForRow(input: {
  workflowStatus: string;
  assignedRecruiter: string;
  actingRecruiter: string;
}): RecruiterOneClickActionId[] {
  const actions: RecruiterOneClickActionId[] = ["assign-me", "contacted"];
  if (["Qualified", "Paperwork Needed"].includes(input.workflowStatus)) {
    actions.push("send-paperwork");
  }
  actions.push("follow-up-complete", "schedule-follow-up");
  if (["Signed", "Ready for MEL"].includes(input.workflowStatus)) {
    actions.push("ready-for-mel");
  }
  actions.push("escalate", "close-candidate");
  return actions;
}

export function mapOneClickActionToWorkflowUpdate(input: {
  candidateId: string;
  action: RecruiterOneClickActionId;
  actingRecruiter: string;
}): OneClickWorkflowUpdate {
  const { candidateId, action, actingRecruiter } = input;

  switch (action) {
    case "assign-me":
      return {
        candidateId,
        assignedRecruiter: actingRecruiter,
        queuePayload: { action: "assign-recruiter", recruiter: actingRecruiter },
      };
    case "contacted":
      return {
        candidateId,
        note: "Contacted candidate",
        queuePayload: { action: "mark-follow-up" },
      };
    case "send-paperwork":
      return {
        candidateId,
        queuePayload: { action: "move-paperwork", status: "Paperwork Needed" },
      };
    case "follow-up-complete":
      return {
        candidateId,
        queuePayload: { action: "complete-follow-up" },
      };
    case "ready-for-mel":
      return {
        candidateId,
        workflowStatus: "Ready for MEL",
        queuePayload: { action: "ready-mel", status: "Ready for MEL" },
      };
    case "schedule-follow-up":
      return {
        candidateId,
        recruitingAction: { type: "needs-follow-up", enabled: true },
        queuePayload: { action: "mark-follow-up" },
      };
    case "close-candidate":
      return {
        candidateId,
        workflowStatus: "Not Qualified",
        note: "Closed from recruiter action center",
      };
    case "escalate":
      return {
        candidateId,
        recruitingAction: { type: "priority-list", enabled: true },
      };
    default:
      return { candidateId };
  }
}

export function queuePayloadFromOneClick(
  update: OneClickWorkflowUpdate,
): CandidateQueueActionPayload | null {
  return update.queuePayload ?? null;
}
