import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { RecruiterAssignmentDecision } from "@/lib/recruiter-assignment-engine/types";
import { RECRUITER_ASSIGNMENT_CONFIDENCE_THRESHOLD } from "@/lib/recruiter-assignment-engine/types";
import type { RecruiterAssignmentCandidateRow } from "@/lib/p151-autonomous-recruiter-assignment/types";
import type { P158AssignmentStatus } from "@/lib/p158-autonomous-recruiter-assignment/types";

export function shouldSkipExistingRecruiter(workflow: CandidateWorkflowRecord | undefined): boolean {
  if (!workflow) return false;
  if (workflow.recruiterAssignmentSource === "manual") return true;
  return !isUnassignedRecruiter(workflow.assignedRecruiter);
}

export function resolveP158AssignmentStatus(input: {
  workflow?: CandidateWorkflowRecord;
  evaluation: RecruiterAssignmentCandidateRow;
  assignment: RecruiterAssignmentDecision;
  duplicateInAudit: boolean;
}): { status: P158AssignmentStatus; skipReason: string | null } {
  if (shouldSkipExistingRecruiter(input.workflow)) {
    return {
      status: "skipped",
      skipReason: `Recruiter already assigned: ${input.workflow?.assignedRecruiter}`,
    };
  }

  if (input.duplicateInAudit) {
    return {
      status: "blocked",
      skipReason: "Duplicate assignment prevented — candidate already assigned in audit log.",
    };
  }

  if (input.evaluation.duplicateStatus) {
    return { status: "blocked", skipReason: "Duplicate candidate — do not assign." };
  }

  if (input.evaluation.recommendation === "Do Not Assign") {
    return { status: "blocked", skipReason: input.evaluation.reason };
  }

  if (input.evaluation.recommendation === "Manual Review") {
    return { status: "manual_review", skipReason: input.evaluation.reason };
  }

  if (input.evaluation.recommendation === "Hold") {
    return { status: "skipped", skipReason: input.evaluation.reason };
  }

  if (!input.assignment.shouldAssign) {
    if (input.assignment.confidence < RECRUITER_ASSIGNMENT_CONFIDENCE_THRESHOLD) {
      return { status: "manual_review", skipReason: input.assignment.reason };
    }
    return { status: "skipped", skipReason: input.assignment.reason };
  }

  return { status: "queued", skipReason: null };
}
