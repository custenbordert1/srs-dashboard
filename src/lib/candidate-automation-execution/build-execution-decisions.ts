import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { RecruiterActionType } from "@/lib/recruiter-action-engine/types";
import type {
  CandidateExecutionDecision,
  CandidateExecutionType,
} from "@/lib/candidate-automation-execution/types";

function mapActionToExecutionType(actionType: RecruiterActionType): CandidateExecutionType | null {
  switch (actionType) {
    case "send-paperwork":
      return "send-paperwork-request";
    case "await-signature":
    case "follow-up":
    case "verify-paperwork":
    case "await-dd":
      return "schedule-recruiter-follow-up";
    case "needs-review":
    case "screen-candidate":
    case "schedule-interview":
      return "create-escalation-task";
    default:
      return null;
  }
}

function isStalledAction(row: ScoredCandidateWorkflowRow, escalationDelayHours: number): boolean {
  if (!row.actionDueDate) return false;
  const dueMs = Date.parse(`${row.actionDueDate}T23:59:59.999Z`);
  if (!Number.isFinite(dueMs)) return false;
  const thresholdMs = dueMs + escalationDelayHours * 60 * 60 * 1000;
  return Date.now() > thresholdMs;
}

export function buildExecutionDecisions(input: {
  candidates: ScoredCandidateWorkflowRow[];
  escalationDelayHours: number;
}): CandidateExecutionDecision[] {
  const decisions: CandidateExecutionDecision[] = [];

  for (const row of input.candidates) {
    if (isUnassignedRecruiter(row.assignedRecruiter)) continue;
    if (!row.actionGeneratedAt) continue;
    if (!row.actionType || row.actionType === "none") continue;

    const executionType = mapActionToExecutionType(row.actionType);
    if (!executionType) continue;

    const stalled = isStalledAction(row, input.escalationDelayHours);

    decisions.push({
      candidateId: row.candidateId,
      executionType: stalled && executionType !== "create-escalation-task"
        ? "create-escalation-task"
        : executionType,
      actionType: row.actionType,
      requiredAction: row.requiredAction ?? row.actionType,
      reason: stalled
        ? `Action overdue beyond ${input.escalationDelayHours}h escalation threshold`
        : row.actionReason ?? row.requiredAction ?? row.actionType,
      stalled,
    });
  }

  return decisions;
}
