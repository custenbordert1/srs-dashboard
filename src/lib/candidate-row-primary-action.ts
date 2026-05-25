import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { SendPaperworkBlockReason } from "@/lib/onboarding-send-eligibility";

export type CandidateRowPrimaryActionKind =
  | "send-packet"
  | "follow-up"
  | "follow-up-done"
  | "review"
  | "ready-for-mel"
  | "assign-me"
  | "open-drawer";

export type CandidateRowPrimaryAction = {
  kind: CandidateRowPrimaryActionKind;
  label: string;
  tone: "teal" | "amber" | "sky" | "cyan" | "neutral";
  disabled?: boolean;
  title?: string;
};

const PAPERWORK_SEND_STATUSES = new Set<ScoredCandidateWorkflowRow["workflowStatus"]>([
  "Qualified",
  "Paperwork Needed",
]);

const REVIEW_STATUSES = new Set<ScoredCandidateWorkflowRow["workflowStatus"]>(["Applied", "Needs Review"]);

export function resolveCandidateRowPrimaryAction(input: {
  candidate: Pick<
    ScoredCandidateWorkflowRow,
    | "workflowStatus"
    | "assignedRecruiter"
    | "recruitingActions"
    | "followUpDueAt"
    | "paperworkStatus"
  >;
  actingRecruiter: string;
  sendBlockReason: SendPaperworkBlockReason | null;
  sendBusy?: boolean;
}): CandidateRowPrimaryAction {
  const { candidate, actingRecruiter, sendBlockReason, sendBusy = false } = input;
  const recruiter = candidate.assignedRecruiter?.trim() || "Unassigned";
  const unassignedRecruiter =
    recruiter === "Unassigned" || recruiter.length === 0 || recruiter !== actingRecruiter.trim();

  if (PAPERWORK_SEND_STATUSES.has(candidate.workflowStatus) && candidate.paperworkStatus !== "signed") {
    const disabled = sendBusy || sendBlockReason !== null;
    return {
      kind: "send-packet",
      label: sendBusy ? "Sending…" : "Send Packet",
      tone: "teal",
      disabled,
      title: disabled && sendBlockReason ? undefined : "Send onboarding packet",
    };
  }

  if (candidate.workflowStatus === "Signed") {
    return {
      kind: "ready-for-mel",
      label: "Ready for MEL",
      tone: "cyan",
      title: "Move candidate to Ready for MEL",
    };
  }

  if (REVIEW_STATUSES.has(candidate.workflowStatus)) {
    return {
      kind: "review",
      label: "Review",
      tone: "sky",
      title: "Open candidate workspace to review",
    };
  }

  if (candidate.recruitingActions.needsFollowUp) {
    return {
      kind: "follow-up-done",
      label: "Follow-up Done",
      tone: "amber",
      title: "Mark follow-up complete",
    };
  }

  if (candidate.followUpDueAt) {
    const due = new Date(candidate.followUpDueAt);
    if (!Number.isNaN(due.getTime()) && due.getTime() <= Date.now()) {
      return {
        kind: "follow-up",
        label: "Follow Up",
        tone: "amber",
        title: "Flag needs follow-up",
      };
    }
  }

  if (unassignedRecruiter) {
    return {
      kind: "assign-me",
      label: "Assign Me",
      tone: "neutral",
      title: `Assign to ${actingRecruiter}`,
    };
  }

  if (candidate.workflowStatus === "Paperwork Sent") {
    return {
      kind: "follow-up",
      label: "Follow Up",
      tone: "amber",
      title: "Check signature status or nudge candidate",
    };
  }

  return {
    kind: "open-drawer",
    label: "Open",
    tone: "neutral",
    title: "Open candidate workspace",
  };
}
