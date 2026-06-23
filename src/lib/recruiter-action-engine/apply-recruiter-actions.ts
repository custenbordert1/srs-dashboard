import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import type { RecruiterActionDecision } from "@/lib/recruiter-action-engine/types";

export async function applyRecruiterActions(input: {
  decisions: RecruiterActionDecision[];
  workflows: Record<string, CandidateWorkflowRecord>;
  byUserId?: string;
}): Promise<CandidateWorkflowRecord[]> {
  const applied: CandidateWorkflowRecord[] = [];

  for (const decision of input.decisions) {
    if (!decision.shouldPersist) continue;

    const existing = input.workflows[decision.candidateId];
    if (!existing) continue;

    const record = await upsertCandidateWorkflow({
      candidateId: decision.candidateId,
      workflowStatus: existing.workflowStatus,
      requiredAction: decision.requiredAction,
      actionType: decision.actionType,
      actionPriority: decision.actionPriority,
      actionReason: decision.actionReason,
      actionDueDate: decision.actionDueDate,
      actionConfidence: decision.actionConfidence,
      actionGeneratedAt: new Date().toISOString(),
      audit: {
        action: "generate_recruiter_action",
        byUserId: input.byUserId,
        metadata: {
          actionType: decision.actionType,
          actionPriority: decision.actionPriority,
          actionReason: decision.actionReason,
          actionDueDate: decision.actionDueDate,
          actionConfidence: decision.actionConfidence,
        },
      },
    });
    applied.push(record);
    input.workflows[decision.candidateId] = record;
  }

  return applied;
}
