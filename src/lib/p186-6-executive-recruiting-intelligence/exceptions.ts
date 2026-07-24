import { calculateAging } from "@/lib/p186-6-executive-recruiting-intelligence/aging";
import type {
  P1866CohortCandidate,
  P1866Exception,
} from "@/lib/p186-6-executive-recruiting-intelligence/types";

/**
 * Executive exception center — acknowledge/note/assign only (no approval/send).
 */
export function classifyExecutiveExceptions(input: {
  cohort: P1866CohortCandidate[];
  nowMs?: number;
}): P1866Exception[] {
  const now = input.nowMs ?? Date.now();
  const aging = new Map(
    calculateAging({ cohort: input.cohort, nowMs: now }).map((a) => [a.candidateId, a]),
  );
  const out: P1866Exception[] = [];

  for (const c of input.cohort) {
    const age = aging.get(c.candidateId);
    if (age?.band === "critical") {
      out.push({
        id: `ex-aging-${c.candidateId}`,
        kind: "critical_aging",
        severity: "critical",
        candidateId: c.candidateId,
        detail: `Critical aging in ${c.funnelStage}`,
        recommendedAction: "Assign investigation owner",
        status: "open",
        investigationOwner: null,
      });
    }
    if (c.shadowMismatch) {
      out.push({
        id: `ex-mismatch-${c.candidateId}`,
        kind: "lifecycle_mismatch",
        severity: "high",
        candidateId: c.candidateId,
        detail: "Lifecycle shadow mismatch",
        recommendedAction: "Request reconciliation",
        status: "open",
        investigationOwner: null,
      });
    }
    if (c.missingShadow) {
      out.push({
        id: `ex-missing-shadow-${c.candidateId}`,
        kind: "missing_shadow_state",
        severity: "high",
        candidateId: c.candidateId,
        detail: "Missing P186 shadow state",
        recommendedAction: "Request reconciliation",
        status: "open",
        investigationOwner: null,
      });
    }
    if (c.workflowConflict) {
      out.push({
        id: `ex-writer-${c.candidateId}`,
        kind: "conflicting_writer",
        severity: "high",
        candidateId: c.candidateId,
        detail: "Conflicting writer / workflow conflict",
        recommendedAction: "Open candidate detail",
        status: "open",
        investigationOwner: null,
      });
    }
    if (c.unresolvedOperations) {
      out.push({
        id: `ex-ops-${c.candidateId}`,
        kind: "unresolved_operation",
        severity: "medium",
        candidateId: c.candidateId,
        detail: "Unresolved operation",
        recommendedAction: "Acknowledge and assign owner",
        status: "open",
        investigationOwner: null,
      });
    }
    if (
      (c.paperworkStatus === "signed" || c.funnelStage === "PAPERWORK_SIGNED") === false &&
      c.paperworkStatus === "signed"
    ) {
      // unreachable guard left for clarity
    }
    if (c.paperworkStatus === "signed" && ["PAPERWORK_SENT", "PAPERWORK_NEEDED"].includes(c.funnelStage)) {
      out.push({
        id: `ex-signed-stale-${c.candidateId}`,
        kind: "signed_but_not_advanced",
        severity: "critical",
        candidateId: c.candidateId,
        detail: "Signed but funnel not advanced",
        recommendedAction: "Request reconciliation",
        status: "open",
        investigationOwner: null,
      });
    }
    if (c.funnelStage === "ONBOARDING_COMPLETE") {
      out.push({
        id: `ex-oc-${c.candidateId}`,
        kind: "onboarding_complete_not_ready_for_mel",
        severity: "medium",
        candidateId: c.candidateId,
        detail: "Onboarding complete but not Ready for MEL",
        recommendedAction: "Open candidate detail",
        status: "open",
        investigationOwner: null,
      });
    }
    if (c.funnelStage === "READY_FOR_MEL" && (c.melExportBlocker || c.blocked)) {
      out.push({
        id: `ex-mel-block-${c.candidateId}`,
        kind: "ready_for_mel_blocked",
        severity: "high",
        candidateId: c.candidateId,
        detail: c.melExportBlocker ?? "Ready for MEL blocked",
        recommendedAction: "Assign investigation owner",
        status: "open",
        investigationOwner: null,
      });
    }
    if (c.melExportBlocker?.toLowerCase().includes("duplicate")) {
      out.push({
        id: `ex-dup-mel-${c.candidateId}`,
        kind: "duplicate_mel_export_risk",
        severity: "high",
        candidateId: c.candidateId,
        detail: "Duplicate MEL export risk",
        recommendedAction: "Acknowledge and investigate",
        status: "open",
        investigationOwner: null,
      });
    }
    if (!c.recruiter) {
      out.push({
        id: `ex-recruiter-${c.candidateId}`,
        kind: "stale_recruiter_assignment",
        severity: "medium",
        candidateId: c.candidateId,
        detail: "Missing/stale recruiter assignment",
        recommendedAction: "Add note / assign investigation",
        status: "open",
        investigationOwner: null,
      });
    }
    if (!c.job) {
      out.push({
        id: `ex-job-${c.candidateId}`,
        kind: "missing_job_assignment",
        severity: "medium",
        candidateId: c.candidateId,
        detail: "Missing job assignment",
        recommendedAction: "Open candidate detail",
        status: "open",
        investigationOwner: null,
      });
    }
    if (c.sourceFreshnessMs == null || (c.sourceFreshnessMs ?? 0) > 12 * 3600000) {
      out.push({
        id: `ex-source-${c.candidateId}`,
        kind: "source_data_unavailable",
        severity: "low",
        candidateId: c.candidateId,
        detail: "Source data stale or unavailable",
        recommendedAction: "Export redacted report after refresh",
        status: "open",
        investigationOwner: null,
      });
    }
  }

  return out;
}

export type ExceptionSafeAction =
  | "assign_investigation_owner"
  | "acknowledge"
  | "add_note"
  | "open_candidate_detail"
  | "request_reconciliation"
  | "export_redacted_report";

export const P1866_EXCEPTION_SAFE_ACTIONS: readonly ExceptionSafeAction[] = [
  "assign_investigation_owner",
  "acknowledge",
  "add_note",
  "open_candidate_detail",
  "request_reconciliation",
  "export_redacted_report",
] as const;
