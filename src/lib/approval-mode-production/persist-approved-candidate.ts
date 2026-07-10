import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import type { P84SendQueueEntry } from "@/lib/p84-send-queue-preview/types";
import {
  appendP97Audit,
  appendP97Rollback,
  loadP97State,
  newAuditId,
  newRollbackId,
  saveP97State,
} from "@/lib/approval-mode-production/approval-mode-store";
import type {
  P97PersistedRecord,
  WorkflowStateSnapshot,
} from "@/lib/approval-mode-production/types";
import { P97_LIVE_SEND, P97_SOURCE_PHASE } from "@/lib/approval-mode-production/types";

export function snapshotWorkflow(record: CandidateWorkflowRecord | undefined): WorkflowStateSnapshot {
  return {
    workflowStatus: record?.workflowStatus ?? "Applied",
    actionType: record?.actionType ?? null,
    assignedRecruiter: record?.assignedRecruiter ?? "Unassigned",
    assignedDM: record?.assignedDM ?? "Unassigned",
  };
}

export async function persistApprovedCandidate(input: {
  sendEntry: P84SendQueueEntry;
  existingWorkflow?: CandidateWorkflowRecord;
  approvedBy: string;
  approvedByUserId: string;
}): Promise<P97PersistedRecord> {
  if (P97_LIVE_SEND) {
    throw new Error("P97 refuses to persist while liveSend would be enabled.");
  }

  const beforeState = snapshotWorkflow(input.existingWorkflow);
  const approvedAt = new Date().toISOString();
  const rollbackId = newRollbackId();

  const record = await upsertCandidateWorkflow({
    candidateId: input.sendEntry.candidateId,
    assignedRecruiter: input.sendEntry.recruiter,
    assignedDM: input.sendEntry.dm,
    workflowStatus: "Paperwork Needed",
    actionType: "send-paperwork",
    requiredAction: "Send paperwork",
    actionReason: "P97 approved P83 advancement to paperwork (approval-mode production).",
    recruiterAssignmentSource: "manual",
    recruiterAssignmentReason: "P97 executive-approved P62 recruiter assignment.",
    recruiterAssignmentConfidence: null,
    forceWorkflowStatus: true,
    note: `P97 approval-mode persist by ${input.approvedBy} at ${approvedAt}`,
    audit: {
      action: "p97_approval_mode_persist",
      byUserId: input.approvedByUserId,
      metadata: {
        approvedBy: input.approvedBy,
        phase: P97_SOURCE_PHASE,
        liveSend: false,
      },
    },
  });

  const afterState = snapshotWorkflow(record);

  const persisted: P97PersistedRecord = {
    candidateId: input.sendEntry.candidateId,
    candidateName: input.sendEntry.candidateName,
    approvedBy: input.approvedBy,
    approvedByUserId: input.approvedByUserId,
    approvedAt,
    beforeState,
    afterState,
    rollbackId,
  };

  const state = await loadP97State();
  state.persisted = state.persisted.filter((p) => p.candidateId !== persisted.candidateId);
  state.persisted.push(persisted);
  state.updatedAt = approvedAt;
  await saveP97State(state);

  await appendP97Rollback({
    rollbackId,
    candidateId: persisted.candidateId,
    candidateName: persisted.candidateName,
    createdAt: approvedAt,
    approvedBy: input.approvedBy,
    beforeState,
    afterState,
    rollbackPlan: `Restore workflowStatus=${beforeState.workflowStatus}, actionType=${beforeState.actionType ?? "none"}, recruiter=${beforeState.assignedRecruiter}, dm=${beforeState.assignedDM}.`,
  });

  await appendP97Audit({
    id: newAuditId(),
    at: approvedAt,
    phase: P97_SOURCE_PHASE,
    action: "approval_persist",
    candidateId: persisted.candidateId,
    candidateName: persisted.candidateName,
    approvedBy: input.approvedBy,
    approvedByUserId: input.approvedByUserId,
    beforeState,
    afterState,
    liveSend: false,
    paperworkSent: false,
  });

  return persisted;
}
