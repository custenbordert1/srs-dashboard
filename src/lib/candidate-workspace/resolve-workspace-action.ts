import type { SendPaperworkBlockReason } from "@/lib/onboarding-send-eligibility";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { WorkspaceAction, WorkspaceActionKind } from "@/lib/candidate-workspace/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isFollowUpOverdue } from "@/lib/candidate-action-sla";

const PAPERWORK_SEND_STATUSES = new Set<ScoredCandidateWorkflowRow["workflowStatus"]>([
  "Qualified",
  "Paperwork Needed",
]);

const REVIEW_STATUSES = new Set<ScoredCandidateWorkflowRow["workflowStatus"]>(["Applied", "Needs Review"]);

function action(
  kind: WorkspaceActionKind,
  label: string,
  description: string,
  tone: WorkspaceAction["tone"],
  options?: { disabled?: boolean; completeLabel?: string },
): WorkspaceAction {
  return {
    kind,
    label,
    description,
    completeLabel: options?.completeLabel ?? "Mark complete",
    tone,
    disabled: options?.disabled,
  };
}

export function resolveWorkspaceAction(input: {
  candidate: Pick<
    ScoredCandidateWorkflowRow,
    | "workflowStatus"
    | "assignedRecruiter"
    | "recruitingActions"
    | "followUpDueAt"
    | "paperworkStatus"
    | "nextActionNeeded"
  >;
  actingRecruiter: string;
  sendBlockReason: SendPaperworkBlockReason | null;
  sendBusy?: boolean;
}): WorkspaceAction {
  const { candidate, actingRecruiter, sendBlockReason, sendBusy = false } = input;
  const recruiter = candidate.assignedRecruiter?.trim() || "Unassigned";

  if (isUnassignedRecruiter(recruiter)) {
    return action(
      "assign-me",
      "Assign to me",
      `Take ownership as ${actingRecruiter} before continuing outreach.`,
      "teal",
      { completeLabel: "Assign to me" },
    );
  }

  if (candidate.recruitingActions.needsFollowUp || isFollowUpOverdue({
    recruitingActions: candidate.recruitingActions,
    followUpDueAt: candidate.followUpDueAt,
  })) {
    return action(
      "follow-up-complete",
      "Follow up",
      candidate.nextActionNeeded || "Complete outreach and log the result.",
      "amber",
      { completeLabel: "Mark contact complete" },
    );
  }

  if (PAPERWORK_SEND_STATUSES.has(candidate.workflowStatus) && candidate.paperworkStatus !== "signed") {
    const disabled = sendBusy || sendBlockReason !== null;
    return action(
      "send-paperwork",
      sendBusy ? "Sending paperwork…" : "Send paperwork",
      "Send the onboarding packet via Dropbox Sign.",
      "teal",
      { disabled, completeLabel: "Packet sent" },
    );
  }

  if (candidate.workflowStatus === "Signed") {
    return action(
      "ready-for-mel",
      "Ready for MEL",
      "Candidate paperwork is signed — advance to MEL loading queue.",
      "cyan",
      { completeLabel: "Move to Ready for MEL" },
    );
  }

  if (
    candidate.recruitingActions.recommendInterview ||
    candidate.workflowStatus === "Qualified"
  ) {
    return action(
      "schedule-interview",
      "Schedule interview",
      "Coordinate interview time and confirm candidate availability.",
      "sky",
      { completeLabel: "Interview complete" },
    );
  }

  if (REVIEW_STATUSES.has(candidate.workflowStatus)) {
    const label = candidate.workflowStatus === "Applied" ? "Contact candidate" : "Review application";
    return action(
      candidate.workflowStatus === "Applied" ? "contact-candidate" : "review-application",
      label,
      candidate.nextActionNeeded || "Make first contact and qualify the candidate.",
      "sky",
      { completeLabel: label === "Contact candidate" ? "Contact complete" : "Review complete" },
    );
  }

  if (candidate.workflowStatus === "Paperwork Sent") {
    return action(
      "follow-up",
      "Follow up",
      "Check signature status or nudge the candidate to complete paperwork.",
      "amber",
      { completeLabel: "Follow-up logged" },
    );
  }

  return action(
    "contact-candidate",
    "Contact candidate",
    candidate.nextActionNeeded || "Continue recruiter outreach.",
    "teal",
    { completeLabel: "Mark contact complete" },
  );
}
