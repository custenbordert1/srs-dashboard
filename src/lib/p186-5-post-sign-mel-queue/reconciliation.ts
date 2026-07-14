import { readP1865Flags } from "@/lib/p186-5-post-sign-mel-queue/flags";
import { isSignedStatus } from "@/lib/p186-5-post-sign-mel-queue/signedVerification";
import type {
  P1865MelQueueItem,
  P1865ReconcileFinding,
} from "@/lib/p186-5-post-sign-mel-queue/types";

export type PostSignReconcileRow = {
  candidateId: string;
  dropboxSignStatus?: string | null;
  p184P185EnvelopeState?: string | null;
  checklistComplete?: boolean;
  checklistPct?: number;
  productionWorkflowState?: string | null;
  shadowState?: string | null;
  melQueueItems?: P1865MelQueueItem[];
  existingMelRecord?: boolean;
  jobOrProjectId?: string | null;
  shadowJobOrProjectId?: string | null;
  pendingReviewAgeMs?: number;
};

/**
 * Read-only post-sign + MEL reconciliation. Never repairs production.
 */
export function reconcilePostSignAndMel(input: {
  cohort: PostSignReconcileRow[];
  stalePendingReviewMs?: number;
  forceFlags?: { reconciliation: boolean };
}): {
  ok: boolean;
  readOnly: true;
  findings: P1865ReconcileFinding[];
  productionRepairs: 0;
  detail: string;
} {
  const flags = readP1865Flags(
    input.forceFlags ? { reconciliation: input.forceFlags.reconciliation } : undefined,
  );
  if (!flags.reconciliation) {
    return {
      ok: false,
      readOnly: true,
      findings: [],
      productionRepairs: 0,
      detail: "P186_POST_SIGN_RECONCILIATION flag is off",
    };
  }

  const staleMs = input.stalePendingReviewMs ?? 7 * 86400000;
  const findings: P1865ReconcileFinding[] = [];

  for (const row of input.cohort) {
    const signed =
      isSignedStatus(row.dropboxSignStatus) || isSignedStatus(row.p184P185EnvelopeState);
    const prod = (row.productionWorkflowState ?? "").toLowerCase();
    const shadow = (row.shadowState ?? "").toUpperCase();
    const queue = row.melQueueItems ?? [];

    if (signed && (prod.includes("paperwork sent") || prod === "paperwork sent")) {
      findings.push({
        candidateId: row.candidateId,
        kind: "signed_but_production_paperwork_sent",
        severity: "critical",
        detail: "Signed envelope but production still Paperwork Sent",
        recommendedAction: "Investigate via authorized production path — do not auto-repair",
      });
    }

    if (
      (prod.includes("awaiting dd") || shadow === "ONBOARDING_COMPLETE") &&
      !prod.includes("ready for mel") &&
      shadow !== "READY_FOR_MEL"
    ) {
      findings.push({
        candidateId: row.candidateId,
        kind: "onboarding_complete_not_ready_for_mel",
        severity: "high",
        detail: "Onboarding complete signal without Ready for MEL",
        recommendedAction: "Operator Ready for MEL review",
      });
    }

    if (
      (prod.includes("ready for mel") || shadow === "READY_FOR_MEL") &&
      row.checklistComplete === false
    ) {
      findings.push({
        candidateId: row.candidateId,
        kind: "ready_for_mel_without_checklist",
        severity: "critical",
        detail: "Ready for MEL without completed checklist",
        recommendedAction: "Block export; complete checklist",
      });
    }

    const active = queue.filter(
      (q) => !["canceled", "failed", "confirmed_exported"].includes(q.status),
    );
    if (active.length > 1) {
      findings.push({
        candidateId: row.candidateId,
        kind: "duplicate_mel_queue_entries",
        severity: "high",
        detail: `${active.length} active MEL queue entries`,
        recommendedAction: "Cancel duplicates via correction workflow",
      });
    }

    if (
      (row.existingMelRecord || prod.includes("loaded in mel")) &&
      active.some((q) => q.status !== "confirmed_exported")
    ) {
      findings.push({
        candidateId: row.candidateId,
        kind: "exported_candidate_still_queued",
        severity: "high",
        detail: "Exported candidate still has active queue row",
        recommendedAction: "Observe external export or cancel queue row",
      });
    }

    if (signed && !row.productionWorkflowState) {
      findings.push({
        candidateId: row.candidateId,
        kind: "missing_production_transition",
        severity: "high",
        detail: "Signed without production workflow record",
        recommendedAction: "Investigate production record",
      });
    }

    if (signed && !row.shadowState) {
      findings.push({
        candidateId: row.candidateId,
        kind: "missing_shadow_record",
        severity: "medium",
        detail: "Signed without P186 shadow record",
        recommendedAction: "Request shadow reconciliation (observe-only)",
      });
    }

    if (
      row.jobOrProjectId &&
      row.shadowJobOrProjectId &&
      row.jobOrProjectId !== row.shadowJobOrProjectId
    ) {
      findings.push({
        candidateId: row.candidateId,
        kind: "conflicting_job_project_assignment",
        severity: "high",
        detail: "Job/project assignment conflict",
        recommendedAction: "Resolve assignment before MEL queue",
      });
    }

    const pending = queue.find((q) => q.status === "pending_review");
    if (pending && (row.pendingReviewAgeMs ?? 0) > staleMs) {
      findings.push({
        candidateId: row.candidateId,
        kind: "stale_pending_review",
        severity: "medium",
        detail: "Stale pending MEL review",
        recommendedAction: "Operator review aging queue",
      });
    }

    if (queue.some((q) => q.status === "failed")) {
      findings.push({
        candidateId: row.candidateId,
        kind: "failed_export_requiring_review",
        severity: "high",
        detail: "Failed MEL queue status requires review",
        recommendedAction: "Investigate failure — no automatic retry export in P186.5",
      });
    }
  }

  return {
    ok: true,
    readOnly: true,
    findings,
    productionRepairs: 0,
    detail: `Evaluated ${input.cohort.length}; ${findings.length} findings; no repairs`,
  };
}
