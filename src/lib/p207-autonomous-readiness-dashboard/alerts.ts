import { createHash } from "node:crypto";
import type {
  P207Alert,
  P207AlertSeverity,
  P207DropboxDiagnostics,
  P207StageMetrics,
  P207Validation,
} from "@/lib/p207-autonomous-readiness-dashboard/types";

export type P207AlertDraft = {
  fingerprint: string;
  severity: P207AlertSeverity;
  title: string;
  explanation: string;
  affectedCount: number;
  subsystem: string;
  recommendedAction: string;
  supportingMetric: string;
  drillKey: string | null;
};

export type P207AlertConditionInput = {
  nowIso: string;
  stages: P207StageMetrics[];
  dropbox: P207DropboxDiagnostics;
  immediateSendReady: number;
  validation: P207Validation;
  questionnaireCoveragePct: number;
  signedToday: number;
  readyForMel: number;
  paperworkSentAgingCount: number;
  unresolvedSendOps: number;
  duplicateEnvelopeRisk: number;
  storeAvailable: boolean;
  statusSyncOk: boolean;
  callbackHealthDegraded: boolean;
  previousQuota: number | null;
  firstSuccessfulSendToday: boolean;
};

function fp(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

function stageCount(stages: P207StageMetrics[], name: string): number {
  return stages.find((s) => s.stage === name)?.count ?? 0;
}

/**
 * Pure alert condition evaluation — no IO, no writes to lifecycle/Dropbox/MEL.
 */
export function evaluateP207AlertConditions(input: P207AlertConditionInput): P207AlertDraft[] {
  const drafts: P207AlertDraft[] = [];
  const needsReview = stageCount(input.stages, "Needs Review");
  const applied = stageCount(input.stages, "Applied");
  const signed = stageCount(input.stages, "Signed");
  const totalTop = Math.max(1, applied + needsReview);

  if (input.dropbox.vendorBlocked && input.immediateSendReady > 0) {
    drafts.push({
      fingerprint: fp(["critical", "dropbox_quota_zero_send_ready"]),
      severity: "critical",
      title: "Dropbox quota exhausted with send-ready candidates",
      explanation:
        "Production Dropbox signature quota is 0 while send-ready Paperwork Needed candidates are waiting.",
      affectedCount: input.immediateSendReady,
      subsystem: "dropbox",
      recommendedAction:
        "Restore Dropbox API quota with the vendor. Do not start P192. Re-run P206 only after quota > 0.",
      supportingMetric: `quota=${input.dropbox.productionQuota ?? 0}; sendReady=${input.immediateSendReady}`,
      drillKey: "send_ready",
    });
  }

  if (input.unresolvedSendOps > 0) {
    drafts.push({
      fingerprint: fp(["critical", "unresolved_send_ops"]),
      severity: "critical",
      title: "Unresolved send operations",
      explanation: "There are send operations that have not reconciled to a confirmed envelope state.",
      affectedCount: input.unresolvedSendOps,
      subsystem: "paperwork_queue",
      recommendedAction: "Inspect send reconciliation queues; do not retry blindly.",
      supportingMetric: `unresolvedSendOps=${input.unresolvedSendOps}`,
      drillKey: "paperwork_sent_risk",
    });
  }

  if (!input.validation.matched || input.validation.countMismatches.length > 0) {
    drafts.push({
      fingerprint: fp(["critical", "lifecycle_reconciliation_mismatch"]),
      severity: "critical",
      title: "Lifecycle reconciliation mismatch",
      explanation: "Dashboard stage totals do not match authoritative workflow classification.",
      affectedCount: input.validation.countMismatches.length,
      subsystem: "lifecycle",
      recommendedAction: "Investigate count mismatches before any operational action.",
      supportingMetric: `mismatches=${input.validation.countMismatches.length}`,
      drillKey: null,
    });
  }

  if (!input.storeAvailable) {
    drafts.push({
      fingerprint: fp(["critical", "production_store_unavailable"]),
      severity: "critical",
      title: "Production store unavailable",
      explanation: "Authoritative workflow/ingestion store could not be read.",
      affectedCount: 1,
      subsystem: "status_sync",
      recommendedAction: "Verify recruiting data directory and durable store health.",
      supportingMetric: "storeAvailable=false",
      drillKey: null,
    });
  }

  if (!input.statusSyncOk || input.dropbox.apiStatus === "error") {
    drafts.push({
      fingerprint: fp(["critical", "status_sync_failure"]),
      severity: "critical",
      title: "Status synchronization failure",
      explanation: "Dropbox account/status probe failed or sync health is degraded.",
      affectedCount: 1,
      subsystem: "status_sync",
      recommendedAction: "Check Dropbox API credentials and network; do not send.",
      supportingMetric: `apiStatus=${input.dropbox.apiStatus}`,
      drillKey: null,
    });
  }

  if (input.duplicateEnvelopeRisk > 0) {
    drafts.push({
      fingerprint: fp(["critical", "duplicate_envelope_risk"]),
      severity: "critical",
      title: "Duplicate envelope risk",
      explanation:
        "Candidates in Paperwork Needed still carry a prior signatureRequestId — re-send risk.",
      affectedCount: input.duplicateEnvelopeRisk,
      subsystem: "paperwork_queue",
      recommendedAction: "Reconcile envelopes before any supervised send pilot.",
      supportingMetric: `duplicateEnvelopeRisk=${input.duplicateEnvelopeRisk}`,
      drillKey: "duplicate_envelope",
    });
  }

  if (input.questionnaireCoveragePct < 55) {
    drafts.push({
      fingerprint: fp(["warning", "questionnaire_degradation"]),
      severity: "warning",
      title: "Questionnaire capture degradation",
      explanation: "Questionnaire coverage across ingested candidates is below the warning threshold.",
      affectedCount: Math.round(100 - input.questionnaireCoveragePct),
      subsystem: "ai_qualification",
      recommendedAction: "Prioritize questionnaire capture recovery before expanding AI approvals.",
      supportingMetric: `questionnaireCoveragePct=${input.questionnaireCoveragePct}`,
      drillKey: "missing_questionnaire",
    });
  }

  if (signed > 0 && input.readyForMel === 0) {
    drafts.push({
      fingerprint: fp(["warning", "ready_for_mel_backlog"]),
      severity: "warning",
      title: "Ready for MEL backlog",
      explanation: "Signed candidates exist but none are Ready for MEL.",
      affectedCount: signed,
      subsystem: "ready_for_mel",
      recommendedAction: "Review signed → MEL readiness path (read-only; no MEL writes).",
      supportingMetric: `signed=${signed}; readyForMel=${input.readyForMel}`,
      drillKey: "Signed",
    });
  }

  if (needsReview / totalTop > 0.08 && needsReview >= 10) {
    drafts.push({
      fingerprint: fp(["warning", "high_needs_review_rate"]),
      severity: "warning",
      title: "High Needs Review rate",
      explanation: "Needs Review volume is elevated relative to Applied + Needs Review.",
      affectedCount: needsReview,
      subsystem: "lifecycle",
      recommendedAction: "Clear recruiter review backlog.",
      supportingMetric: `needsReview=${needsReview}; rate=${Math.round((needsReview / totalTop) * 100)}%`,
      drillKey: "Needs Review",
    });
  }

  if (input.paperworkSentAgingCount > 25) {
    drafts.push({
      fingerprint: fp(["warning", "paperwork_sent_aging"]),
      severity: "warning",
      title: "Paperwork Sent aging",
      explanation: "A large cohort remains awaiting signature.",
      affectedCount: input.paperworkSentAgingCount,
      subsystem: "paperwork_queue",
      recommendedAction: "Monitor signature follow-up; do not auto-resend in this phase.",
      supportingMetric: `awaitingSignature=${input.paperworkSentAgingCount}`,
      drillKey: "Paperwork Sent",
    });
  }

  if (input.callbackHealthDegraded) {
    drafts.push({
      fingerprint: fp(["warning", "callback_polling_degraded"]),
      severity: "warning",
      title: "Callback or polling health degraded",
      explanation: "Status callback/polling path appears degraded.",
      affectedCount: 1,
      subsystem: "status_sync",
      recommendedAction: "Verify webhook/polling health without enabling automation.",
      supportingMetric: "callbackHealthDegraded=true",
      drillKey: null,
    });
  }

  if (
    input.dropbox.quotaRestoredRecommendP206 ||
    input.dropbox.recoveryState === "Quota Restored — Pilot Required"
  ) {
    drafts.push({
      fingerprint: fp(["informational", "dropbox_quota_restored"]),
      severity: "informational",
      title: "Dropbox quota restored",
      explanation:
        "Quota is greater than zero. Supervised pilot (P206) is required before any production sends.",
      affectedCount: input.immediateSendReady,
      subsystem: "dropbox",
      recommendedAction: "Re-run P206 supervised send pilot. Do not start P192 automatically.",
      supportingMetric: `quota=${input.dropbox.productionQuota}; recovery=${input.dropbox.recoveryState}`,
      drillKey: "send_ready",
    });
  }

  if (input.firstSuccessfulSendToday) {
    drafts.push({
      fingerprint: fp(["informational", "first_successful_production_send"]),
      severity: "informational",
      title: "First successful production send",
      explanation: "A successful production send was observed for today.",
      affectedCount: 1,
      subsystem: "dropbox",
      recommendedAction: "Continue monitored pilot cadence; keep automation off.",
      supportingMetric: `lastSuccessfulSendAt=${input.dropbox.lastSuccessfulSendAt}`,
      drillKey: null,
    });
  }

  if (input.signedToday > 0) {
    drafts.push({
      fingerprint: fp(["informational", "signatures_completed_today"]),
      severity: "informational",
      title: "Signatures completed today",
      explanation: "Candidates completed signatures today.",
      affectedCount: input.signedToday,
      subsystem: "paperwork_queue",
      recommendedAction: "Review signed cohort for MEL readiness (no MEL writes).",
      supportingMetric: `signedToday=${input.signedToday}`,
      drillKey: "signed_today",
    });
  }

  if (input.readyForMel > 0) {
    drafts.push({
      fingerprint: fp(["informational", "ready_for_mel_present"]),
      severity: "informational",
      title: "Candidates became Ready for MEL",
      explanation: "One or more candidates are in Ready for MEL.",
      affectedCount: input.readyForMel,
      subsystem: "ready_for_mel",
      recommendedAction: "Coordinate MEL handoff outside this dashboard (no MEL writes here).",
      supportingMetric: `readyForMel=${input.readyForMel}`,
      drillKey: "Ready for MEL",
    });
  }

  return drafts;
}

/**
 * Merge evaluated conditions with prior alert state for deduplication.
 * Same fingerprint → update lastObservedAt, keep firstObservedAt, do not create a new id.
 * Absent fingerprints → mark resolved.
 */
export function mergeP207Alerts(input: {
  drafts: P207AlertDraft[];
  prior: P207Alert[];
  nowIso: string;
}): P207Alert[] {
  const priorByFp = new Map(input.prior.map((a) => [a.fingerprint, a]));
  const seen = new Set<string>();
  const next: P207Alert[] = [];

  for (const draft of input.drafts) {
    seen.add(draft.fingerprint);
    const existing = priorByFp.get(draft.fingerprint);
    if (existing && !existing.resolved) {
      next.push({
        ...existing,
        title: draft.title,
        explanation: draft.explanation,
        affectedCount: draft.affectedCount,
        subsystem: draft.subsystem,
        recommendedAction: draft.recommendedAction,
        supportingMetric: draft.supportingMetric,
        drillKey: draft.drillKey,
        lastObservedAt: input.nowIso,
        resolved: false,
        resolvedAt: null,
      });
    } else if (existing?.resolved) {
      // Re-open with same id/fingerprint; new firstObservedAt.
      next.push({
        ...existing,
        ...draft,
        id: existing.id,
        firstObservedAt: input.nowIso,
        lastObservedAt: input.nowIso,
        resolved: false,
        resolvedAt: null,
      });
    } else {
      next.push({
        id: `p207-${draft.fingerprint}`,
        ...draft,
        firstObservedAt: input.nowIso,
        lastObservedAt: input.nowIso,
        resolved: false,
        resolvedAt: null,
      });
    }
  }

  for (const prior of input.prior) {
    if (seen.has(prior.fingerprint)) continue;
    if (prior.resolved) {
      next.push(prior);
      continue;
    }
    next.push({
      ...prior,
      resolved: true,
      resolvedAt: input.nowIso,
      lastObservedAt: input.nowIso,
    });
  }

  return next.sort((a, b) => {
    const order = { critical: 0, warning: 1, informational: 2 };
    return order[a.severity] - order[b.severity] || (a.resolved === b.resolved ? 0 : a.resolved ? 1 : -1);
  });
}
