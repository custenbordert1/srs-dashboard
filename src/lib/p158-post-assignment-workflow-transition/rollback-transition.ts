import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import {
  appendP1583TransitionAuditEvent,
  loadP1583TransitionRollbackRecords,
  markP1583TransitionRollbackComplete,
} from "@/lib/p158-post-assignment-workflow-transition/transition-audit-store";

export async function rollbackP1583Transition(rollbackId: string, byUserId?: string): Promise<boolean> {
  const records = await loadP1583TransitionRollbackRecords();
  const record = records.find((r) => r.rollbackId === rollbackId && !r.rolledBackAt);
  if (!record) return false;

  await upsertCandidateWorkflow({
    candidateId: record.candidateId,
    workflowStatus: (record.beforeWorkflowStatus as import("@/lib/candidate-workflow-types").CandidateWorkflowStatus) ?? "Applied",
    actionType: (record.beforeActionType as import("@/lib/candidate-workflow-types").RecruiterActionType) ?? null,
    requiredAction: record.beforeRequiredAction,
    audit: {
      action: "p158_workflow_transition_rollback",
      byUserId,
      metadata: { rollbackId },
    },
  });

  await markP1583TransitionRollbackComplete(rollbackId);
  await appendP1583TransitionAuditEvent({
    candidateId: record.candidateId,
    candidateName: record.candidateId,
    action: "rolled_back",
    executionMode: "production",
    beforeWorkflowStatus: record.afterWorkflowStatus,
    afterWorkflowStatus: record.beforeWorkflowStatus,
    beforeActionType: record.afterActionType,
    afterActionType: record.beforeActionType,
    reason: `Rolled back transition ${rollbackId}`,
    rollbackId,
    metadata: { rolledBack: true },
  });

  return true;
}
