import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { applyCandidatePaperworkSigned } from "@/lib/candidate-workflow-store";
import type { DropboxSignRequestSummary } from "@/lib/dropbox-sign";
import type {
  P246DropboxLiveStatus,
  P246ReconciliationRecord,
  P246ReminderStore,
} from "@/lib/p246-outstanding-paperwork-reminders/types";
import { getPacketReminderState } from "@/lib/p246-outstanding-paperwork-reminders/store";

export type P246ReconcileInput = {
  candidateId: string;
  candidateName: string;
  workflow: CandidateWorkflowRecord;
  breezyStage: string | null;
  signatureRequestId: string | null;
  dropboxLiveStatus: P246DropboxLiveStatus | null;
  dropboxVerified: boolean;
  dropboxSummary: DropboxSignRequestSummary | null;
  dropboxError: string | null;
  store: P246ReminderStore;
  /** When true, apply safe internal corrections (Dropbox signed/complete). */
  applySafeCorrections: boolean;
};

export type P246ReconcileResult = {
  record: P246ReconciliationRecord;
  corrected: boolean;
};

function internalLooksOutstanding(workflow: CandidateWorkflowRecord): boolean {
  return (
    workflow.workflowStatus === "Paperwork Sent" ||
    workflow.paperworkStatus === "sent" ||
    workflow.paperworkStatus === "viewed"
  );
}

function internalLooksSigned(workflow: CandidateWorkflowRecord): boolean {
  return workflow.workflowStatus === "Signed" || workflow.paperworkStatus === "signed";
}

export async function reconcileCandidateStatus(
  input: P246ReconcileInput,
): Promise<P246ReconcileResult> {
  const reminder = input.signatureRequestId
    ? getPacketReminderState(input.store, input.candidateId, input.signatureRequestId)
    : null;

  const base = {
    candidateId: input.candidateId,
    candidateName: input.candidateName,
    signatureRequestId: input.signatureRequestId,
    workflowStatus: input.workflow.workflowStatus,
    paperworkStatus: input.workflow.paperworkStatus,
    breezyStage: input.breezyStage,
    dropboxLiveStatus: input.dropboxLiveStatus,
    dropboxVerified: input.dropboxVerified,
    reminderCount: reminder?.reminderCount ?? 0,
  };

  if (!input.signatureRequestId) {
    return {
      corrected: false,
      record: {
        ...base,
        conflictType: "missing_signature_request",
        action: "excluded_missing_request",
        detail: "No signature request id — cannot verify or remind",
      },
    };
  }

  if (!input.dropboxVerified) {
    return {
      corrected: false,
      record: {
        ...base,
        conflictType: "lookup_failed",
        action: "excluded_unverified",
        detail: input.dropboxError ?? "Live Dropbox status unverified",
      },
    };
  }

  const status = input.dropboxLiveStatus!;
  const dropboxSigned = status === "signed" || status === "complete";
  const dropboxOutstanding =
    status === "pending" ||
    status === "awaiting_signature" ||
    status === "viewed" ||
    status === "partially_signed";

  if (dropboxSigned && internalLooksOutstanding(input.workflow)) {
    if (input.applySafeCorrections) {
      try {
        await applyCandidatePaperworkSigned({
          candidateId: input.candidateId,
          signatureRequestId: input.signatureRequestId,
          byUserId: "p246-status-reconciliation",
        });
        return {
          corrected: true,
          record: {
            ...base,
            conflictType: "dropbox_signed_internal_outstanding",
            action: "corrected_internal_to_signed",
            detail: `Dropbox=${status}; internal was ${input.workflow.paperworkStatus}/${input.workflow.workflowStatus} — corrected to Signed`,
          },
        };
      } catch (error) {
        return {
          corrected: false,
          record: {
            ...base,
            conflictType: "dropbox_signed_internal_outstanding",
            action: "flagged_for_investigation",
            detail: `Safe correction failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        };
      }
    }
    return {
      corrected: false,
      record: {
        ...base,
        conflictType: "dropbox_signed_internal_outstanding",
        action: "none",
        detail: `Dropbox=${status}; internal still outstanding — will correct on live/reconcile write`,
      },
    };
  }

  if (internalLooksSigned(input.workflow) && dropboxOutstanding) {
    return {
      corrected: false,
      record: {
        ...base,
        conflictType: "internal_signed_dropbox_outstanding",
        action: "flagged_for_investigation",
        detail: `Internal signed but Dropbox=${status} — do not auto-downgrade`,
      },
    };
  }

  if (
    dropboxOutstanding &&
    internalLooksOutstanding(input.workflow) &&
    input.workflow.paperworkStatus === "viewed" &&
    status === "awaiting_signature"
  ) {
    return {
      corrected: false,
      record: {
        ...base,
        conflictType: "status_mismatch",
        action: "none",
        detail: "Internal viewed vs Dropbox awaiting_signature — Dropbox is source of truth",
      },
    };
  }

  return {
    corrected: false,
    record: {
      ...base,
      conflictType: "none",
      action: "none",
      detail: "No actionable conflict",
    },
  };
}
