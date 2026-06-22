import type { WorkflowAdvancementResult, WorkspaceActionKind } from "@/lib/candidate-workspace/types";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";

export function advanceWorkflowOnComplete(
  action: WorkspaceActionKind,
  candidate: Pick<ScoredCandidateWorkflowRow, "workflowStatus" | "recruitingActions">,
): WorkflowAdvancementResult {
  switch (action) {
    case "contact-candidate":
      if (candidate.workflowStatus === "Applied") {
        return {
          statusChange: "Needs Review",
          completeFollowUp: true,
          note: "Initial contact completed.",
        };
      }
      return { completeFollowUp: true, note: "Contact logged." };

    case "review-application":
      return {
        statusChange: "Qualified",
        completeFollowUp: true,
        note: "Application reviewed and qualified.",
      };

    case "schedule-interview":
      return {
        statusChange: "Paperwork Needed",
        recruitingActions: [{ type: "recommend-interview", enabled: false }],
        note: "Interview completed — ready for paperwork.",
      };

    case "send-paperwork":
      return { note: "Paperwork send initiated from workspace." };

    case "ready-for-mel":
      return {
        statusChange: "Ready for MEL",
        note: "Candidate marked ready for MEL.",
      };

    case "follow-up":
    case "follow-up-complete":
      return { completeFollowUp: true, note: "Follow-up completed." };

    case "assign-me":
      return { note: "Recruiter assignment updated." };

    default:
      return {};
  }
}
