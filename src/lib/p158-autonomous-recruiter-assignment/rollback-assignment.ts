import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import {
  appendP158AssignmentAuditEvent,
  loadP158RollbackRecords,
  markP158RollbackComplete,
} from "@/lib/p158-autonomous-recruiter-assignment/assignment-audit-store";

export async function rollbackP158Assignment(rollbackId: string, byUserId?: string): Promise<boolean> {
  const records = await loadP158RollbackRecords();
  const record = records.find((r) => r.rollbackId === rollbackId && !r.rolledBackAt);
  if (!record) return false;

  await upsertCandidateWorkflow({
    candidateId: record.candidateId,
    assignedRecruiter: record.beforeRecruiter ?? "Unassigned",
    ...(record.beforeDm ? { assignedDM: record.beforeDm } : {}),
    recruiterAssignmentSource: "manual",
    recruiterAssignmentReason: `P158 rollback ${rollbackId}`,
    audit: {
      action: "p158_assignment_rollback",
      byUserId,
      metadata: { rollbackId },
    },
  });

  await markP158RollbackComplete(rollbackId);
  await appendP158AssignmentAuditEvent({
    candidateId: record.candidateId,
    candidateName: record.candidateId,
    action: "rolled_back",
    recruiter: record.beforeRecruiter,
    confidence: 0,
    reason: `Rolled back assignment ${rollbackId}`,
    executionMode: "production",
    beforeRecruiter: record.afterRecruiter,
    afterRecruiter: record.beforeRecruiter,
    rollbackId,
    metadata: { rolledBack: true },
  });

  return true;
}
