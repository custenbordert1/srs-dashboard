import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { evaluateCandidateEligibility } from "@/lib/p187-1-canary-cohort-readiness/eligibility";
import type { P1871EligibilityResult } from "@/lib/p187-1-canary-cohort-readiness/types";

export type ProductionScanEnrichment = {
  jobAssignmentRef?: string | null;
  jobAssignmentResolved?: boolean;
  identityResolved?: boolean;
  shadowPresent?: boolean;
  shadowState?: string | null;
  lifecycleMismatch?: boolean;
  duplicateApprovalEvent?: boolean;
  conflictingOperation?: boolean;
  unresolvedAuditIssue?: boolean;
  rollbackStateAvailable?: boolean;
  operatorOwner?: string | null;
};

/**
 * Map production workflow records → eligibility results (read-only).
 * Does not approve or modify candidates.
 */
export function scanWorkflowRecordsForEligibility(
  workflows: Record<string, CandidateWorkflowRecord> | CandidateWorkflowRecord[],
  enrichments?: Record<string, ProductionScanEnrichment>,
  nowMs?: number,
): P1871EligibilityResult[] {
  const list = Array.isArray(workflows) ? workflows : Object.values(workflows);
  return list.map((wf) => {
    const e = enrichments?.[wf.candidateId] ?? {};
    const notes = wf.notes ?? [];
    const withdrawn =
      notes.some((n) => /withdrawn/i.test(n)) ||
      /withdrawn/i.test(wf.nextActionNeeded ?? "");
    const archived = notes.some((n) => /\[ARCHIVED\]|archived/i.test(n));

    return evaluateCandidateEligibility({
      candidateId: wf.candidateId,
      workflowStatus: wf.workflowStatus,
      recommendedStage: wf.recommendedStage ?? null,
      notes,
      assignedRecruiter: wf.assignedRecruiter,
      assignedDM: wf.assignedDM,
      withdrawn,
      archived,
      nextActionNeeded: wf.nextActionNeeded,
      progressionReason: wf.progressionReason ?? null,
      productionRecordVersion: `${wf.updatedAt}:${wf.workflowStatus}:${(wf.history ?? []).length}`,
      lastActionAt: wf.lastActionAt,
      updatedAt: wf.updatedAt,
      nowMs,
      identityResolved: e.identityResolved ?? Boolean(wf.candidateId?.trim()),
      jobAssignmentResolved: e.jobAssignmentResolved ?? Boolean(e.jobAssignmentRef?.trim()),
      jobAssignmentRef: e.jobAssignmentRef ?? null,
      operatorOwner: e.operatorOwner,
      shadowPresent: e.shadowPresent ?? true,
      shadowState: e.shadowState,
      lifecycleMismatch: e.lifecycleMismatch,
      duplicateApprovalEvent: e.duplicateApprovalEvent,
      conflictingOperation: e.conflictingOperation,
      unresolvedAuditIssue: e.unresolvedAuditIssue,
      rollbackStateAvailable: e.rollbackStateAvailable ?? true,
    });
  });
}

/**
 * Load production workflow store read-only. Never writes.
 */
export async function loadProductionWorkflowsReadonly(): Promise<{
  used: boolean;
  count: number;
  workflows: Record<string, CandidateWorkflowRecord>;
  note: string;
  healthy: boolean;
}> {
  try {
    const { getCandidateWorkflowState } = await import("@/lib/candidate-workflow-store");
    const state = await getCandidateWorkflowState();
    const count = Object.keys(state).length;
    return {
      used: count > 0,
      count,
      workflows: state,
      note: `Read-only load of ${count} workflow records`,
      healthy: true,
    };
  } catch (err) {
    return {
      used: false,
      count: 0,
      workflows: {},
      note: `Workflow store unavailable: ${err instanceof Error ? err.message : String(err)}`,
      healthy: false,
    };
  }
}
