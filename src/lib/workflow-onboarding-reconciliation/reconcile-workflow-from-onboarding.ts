import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  isOnboardingAheadOfWorkflow,
  paperworkStatusFromOnboarding,
  workflowStatusFromOnboarding,
} from "@/lib/workflow-onboarding-reconciliation/workflow-durability";

export type ReconcileWorkflowFromOnboardingInput = {
  candidateId: string;
  workflow: CandidateWorkflowRecord | null | undefined;
  onboarding: CandidateOnboardingRecord | null | undefined;
  byUserId?: string;
};

export type ReconcileWorkflowFromOnboardingResult = {
  reconciled: boolean;
  skippedReason: string | null;
  record: CandidateWorkflowRecord | null;
  changes: string[];
};

export function planWorkflowReconciliationFromOnboarding(
  input: ReconcileWorkflowFromOnboardingInput,
): ReconcileWorkflowFromOnboardingResult {
  const { workflow, onboarding } = input;
  if (!onboarding) {
    return { reconciled: false, skippedReason: "no_onboarding_record", record: null, changes: [] };
  }

  const targetPaperwork = paperworkStatusFromOnboarding(onboarding.status);
  const targetWorkflowStatus = workflowStatusFromOnboarding(onboarding.status);
  if (!targetPaperwork || !targetWorkflowStatus) {
    return {
      reconciled: false,
      skippedReason: `onboarding_status_not_ahead:${onboarding.status}`,
      record: null,
      changes: [],
    };
  }

  const current = workflow ?? null;
  if (current && !isOnboardingAheadOfWorkflow(onboarding.status, current)) {
    const sigMismatch =
      onboarding.signatureRequestId &&
      current.signatureRequestId &&
      onboarding.signatureRequestId !== current.signatureRequestId;
    if (!sigMismatch) {
      return {
        reconciled: false,
        skippedReason: "workflow_already_aligned",
        record: null,
        changes: [],
      };
    }
  }

  const changes: string[] = [];
  if (!current || current.paperworkStatus !== targetPaperwork) {
    changes.push(`paperworkStatus: ${current?.paperworkStatus ?? "none"} -> ${targetPaperwork}`);
  }
  if (!current || current.workflowStatus !== targetWorkflowStatus) {
    changes.push(`workflowStatus: ${current?.workflowStatus ?? "none"} -> ${targetWorkflowStatus}`);
  }
  if (onboarding.signatureRequestId && current?.signatureRequestId !== onboarding.signatureRequestId) {
    changes.push(
      `signatureRequestId: ${current?.signatureRequestId ?? "none"} -> ${onboarding.signatureRequestId}`,
    );
  }
  if (onboarding.sentAt && current?.paperworkSentAt !== onboarding.sentAt) {
    changes.push(`paperworkSentAt: ${current?.paperworkSentAt ?? "none"} -> ${onboarding.sentAt}`);
  }

  if (changes.length === 0) {
    return { reconciled: false, skippedReason: "no_changes_needed", record: null, changes: [] };
  }

  return { reconciled: true, skippedReason: null, record: null, changes };
}

export async function reconcileWorkflowFromOnboarding(
  input: ReconcileWorkflowFromOnboardingInput,
): Promise<ReconcileWorkflowFromOnboardingResult> {
  const plan = planWorkflowReconciliationFromOnboarding(input);
  if (!plan.reconciled) {
    return plan;
  }

  const { onboarding } = input;
  if (!onboarding) {
    return plan;
  }

  const targetPaperwork = paperworkStatusFromOnboarding(onboarding.status)!;
  const targetWorkflowStatus = workflowStatusFromOnboarding(onboarding.status)!;

  const record = await upsertCandidateWorkflow({
    candidateId: input.candidateId,
    workflowStatus: targetWorkflowStatus,
    paperworkStatus: targetPaperwork,
    signatureRequestId: onboarding.signatureRequestId ?? null,
    paperworkSentAt: onboarding.sentAt ?? null,
    paperworkViewedAt:
      onboarding.status === "viewed" || onboarding.status === "partially_completed"
        ? onboarding.sentAt ?? null
        : undefined,
    paperworkSignedAt:
      onboarding.status === "completed" || onboarding.status === "ready_for_mel"
        ? onboarding.completedAt ?? onboarding.sentAt ?? null
        : undefined,
    forceWorkflowStatus: true,
    forcePaperworkStatus: true,
    paperworkHistoryMessage: `Reconciled workflow from onboarding (${onboarding.status}).`,
    audit: {
      action: "reconcile_workflow_from_onboarding",
      byUserId: input.byUserId,
      metadata: {
        onboardingId: onboarding.onboardingId,
        onboardingStatus: onboarding.status,
        signatureRequestId: onboarding.signatureRequestId ?? "",
      },
    },
  });

  return { reconciled: true, skippedReason: null, record, changes: plan.changes };
}
