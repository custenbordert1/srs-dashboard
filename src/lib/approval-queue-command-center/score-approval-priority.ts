import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CoverageStatus } from "@/lib/autonomous-recruiting-engine/types";
import type {
  ApprovalQueueExceptionFlag,
  ApprovalQueuePriority,
} from "@/lib/approval-queue-command-center/types";
import {
  gradePriorityScore,
  intelligenceSignalBoost,
  positionUrgencyBoost,
  queueAgeBoost,
  recruiterWorkloadBoost,
  resolveConfidenceScore,
  scoreApprovalQueuePriority,
} from "@/lib/recruiter-priority";

export { gradePriorityScore, resolveConfidenceScore, positionUrgencyBoost, queueAgeBoost, recruiterWorkloadBoost, intelligenceSignalBoost };

export function resolveExceptionFlags(input: {
  row: ScoredCandidateWorkflowRow;
  hasDrift: boolean;
  confidenceScore: number;
}): ApprovalQueueExceptionFlag[] {
  const flags: ApprovalQueueExceptionFlag[] = [];
  if (input.hasDrift) flags.push("store-drift");
  if (!input.row.assignedRecruiter?.trim() || input.row.assignedRecruiter.toLowerCase() === "unassigned") {
    flags.push("unassigned-recruiter");
  }
  if (!input.row.email?.trim()) flags.push("missing-email");
  if (
    input.row.workflowStatus === "Applied" &&
    (input.row.paperworkStatus === "sent" || input.row.paperworkStatus === "viewed")
  ) {
    flags.push("workflow-mismatch");
  }
  if (input.confidenceScore < 8) flags.push("low-confidence");
  if (input.row.aiGrade === "D" || input.row.aiGrade === "C") flags.push("low-grade");
  return flags;
}

export function scoreApprovalPriority(input: {
  row: ScoredCandidateWorkflowRow;
  queueAgeHours: number | null;
  positionUrgency: CoverageStatus;
  recruiterQueueCount: number;
  hasDrift: boolean;
}): {
  priorityScore: number;
  priority: ApprovalQueuePriority;
  confidenceScore: number;
  priorityReasons: string[];
  exceptionFlags: ApprovalQueueExceptionFlag[];
} {
  const confidenceScore = resolveConfidenceScore(input.row);
  const scored = scoreApprovalQueuePriority({
    row: input.row,
    queueAgeHours: input.queueAgeHours,
    positionUrgency: input.positionUrgency,
    recruiterQueueCount: input.recruiterQueueCount,
  });

  const exceptionFlags = resolveExceptionFlags({
    row: input.row,
    hasDrift: input.hasDrift,
    confidenceScore,
  });

  return {
    priorityScore: scored.priorityScore,
    priority: scored.priorityLevel,
    confidenceScore,
    priorityReasons: scored.priorityReasons,
    exceptionFlags,
  };
}
