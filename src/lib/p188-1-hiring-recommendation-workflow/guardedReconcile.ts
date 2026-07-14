import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { planOnboardingReconcileGuard } from "@/lib/p188-1-hiring-recommendation-workflow/bypassDetector";
import { readP1881Flags } from "@/lib/p188-1-hiring-recommendation-workflow/flags";
import { upsertCandidateWorkflow } from "@/lib/candidate-workflow-store";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import {
  isOnboardingAheadOfWorkflow,
  paperworkStatusFromOnboarding,
  workflowStatusFromOnboarding,
} from "@/lib/workflow-onboarding-reconciliation/workflow-durability";

/**
 * Guarded onboarding reconcile:
 * - Never auto-creates Hiring Recommendation / Operator Approved / Paperwork Needed as recommendations
 * - When prevent flag on + mid-funnel: sync paperwork historical fields only; keep workflow status
 * - Does not call P184/P185 send
 */
export async function reconcileOnboardingWithMidfunnelGuard(input: {
  candidateId: string;
  workflow: CandidateWorkflowRecord | null | undefined;
  onboarding: CandidateOnboardingRecord | null | undefined;
  byUserId?: string;
  upsert?: typeof upsertCandidateWorkflow;
  forceFlags?: { preventOnboardingMidfunnelBypass: boolean };
}): Promise<{
  reconciled: boolean;
  skippedReason: string | null;
  bypassFinding: boolean;
  workflowStatusAdvanced: boolean;
  createdHiringRecommendation: false;
  createdOperatorApproved: false;
  paperworkSendAttempted: false;
  changes: string[];
}> {
  const flags = readP1881Flags(
    input.forceFlags
      ? {
          preventOnboardingMidfunnelBypass:
            input.forceFlags.preventOnboardingMidfunnelBypass,
        }
      : undefined,
  );

  if (!input.onboarding) {
    return {
      reconciled: false,
      skippedReason: "no_onboarding_record",
      bypassFinding: false,
      workflowStatusAdvanced: false,
      createdHiringRecommendation: false,
      createdOperatorApproved: false,
      paperworkSendAttempted: false,
      changes: [],
    };
  }

  const targetPaperwork = paperworkStatusFromOnboarding(input.onboarding.status);
  const targetWorkflowStatus = workflowStatusFromOnboarding(input.onboarding.status);
  if (!targetPaperwork || !targetWorkflowStatus) {
    return {
      reconciled: false,
      skippedReason: `onboarding_status_not_ahead:${input.onboarding.status}`,
      bypassFinding: false,
      workflowStatusAdvanced: false,
      createdHiringRecommendation: false,
      createdOperatorApproved: false,
      paperworkSendAttempted: false,
      changes: [],
    };
  }

  const current = input.workflow ?? null;
  if (current && !isOnboardingAheadOfWorkflow(input.onboarding.status, current)) {
    return {
      reconciled: false,
      skippedReason: "workflow_already_aligned",
      bypassFinding: false,
      workflowStatusAdvanced: false,
      createdHiringRecommendation: false,
      createdOperatorApproved: false,
      paperworkSendAttempted: false,
      changes: [],
    };
  }

  const guard = planOnboardingReconcileGuard({
    workflowStatus: current?.workflowStatus,
    targetWorkflowStatus,
    forceFlags: {
      preventOnboardingMidfunnelBypass: flags.preventOnboardingMidfunnelBypass,
    },
  });

  const upsert = input.upsert ?? upsertCandidateWorkflow;
  const changes: string[] = [];
  const advance = guard.allowWorkflowStatusAdvance;

  if (advance && (!current || current.workflowStatus !== targetWorkflowStatus)) {
    changes.push(`workflowStatus -> ${targetWorkflowStatus}`);
  }
  if (!current || current.paperworkStatus !== targetPaperwork) {
    changes.push(`paperworkStatus -> ${targetPaperwork} (historical fact)`);
  }

  if (changes.length === 0) {
    return {
      reconciled: false,
      skippedReason: "no_changes_needed",
      bypassFinding: guard.bypassFinding,
      workflowStatusAdvanced: false,
      createdHiringRecommendation: false,
      createdOperatorApproved: false,
      paperworkSendAttempted: false,
      changes: [],
    };
  }

  await upsert({
    candidateId: input.candidateId,
    workflowStatus: advance ? targetWorkflowStatus : undefined,
    paperworkStatus: targetPaperwork,
    signatureRequestId: input.onboarding.signatureRequestId ?? null,
    paperworkSentAt: input.onboarding.sentAt ?? null,
    forceWorkflowStatus: advance,
    forcePaperworkStatus: true,
    note: guard.bypassFinding
      ? `[P188.1_BYPASS_FINDING] ${guard.detail}`
      : undefined,
    paperworkHistoryMessage: `Reconciled workflow from onboarding (${input.onboarding.status})${
      advance ? "" : " [midfunnel-protected]"
    }.`,
    audit: {
      action: "p1881_reconcile_onboarding_guarded",
      byUserId: input.byUserId,
      metadata: {
        bypassFinding: guard.bypassFinding,
        workflowStatusAdvanced: advance,
        onboardingStatus: input.onboarding.status,
      },
    },
  });

  return {
    reconciled: true,
    skippedReason: null,
    bypassFinding: guard.bypassFinding,
    workflowStatusAdvanced: advance,
    createdHiringRecommendation: false,
    createdOperatorApproved: false,
    paperworkSendAttempted: false,
    changes,
  };
}
