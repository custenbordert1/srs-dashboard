import type {
  P187CandidateResult,
  P187ReconciliationFinding,
  P187ReconciliationReport,
} from "@/lib/p187-hr-to-oa-canary/types";
import { P187_TO_STATE } from "@/lib/p187-hr-to-oa-canary/types";
import { readP187Flags } from "@/lib/p187-hr-to-oa-canary/flags";

/**
 * Compare legacy workflow expectations vs P186 canary results.
 */
export function buildReconciliationReport(input: {
  results: P187CandidateResult[];
  legacyByCandidate?: Record<string, { lifecycleState: string }>;
  forceFlags?: { reconciliation: boolean };
}): P187ReconciliationReport | { ok: false; reason: string } {
  const flags = readP187Flags(
    input.forceFlags ? { reconciliation: input.forceFlags.reconciliation } : undefined,
  );
  if (!flags.reconciliation) {
    return { ok: false, reason: "P187_RECONCILIATION flag is off" };
  }

  const findings: P187ReconciliationFinding[] = [];
  let matches = 0;
  let mismatches = 0;
  let duplicateTransitions = 0;
  let skippedTransitions = 0;
  let invalidStateChanges = 0;
  let auditGaps = 0;

  for (const r of input.results) {
    const legacy = input.legacyByCandidate?.[r.candidateId];
    if (legacy && legacy.lifecycleState !== r.lifecycleAfter && r.ok) {
      findings.push({
        kind: "mismatch",
        candidateId: r.candidateId,
        detail: `Legacy=${legacy.lifecycleState} P186=${r.lifecycleAfter}`,
        severity: "critical",
      });
      mismatches += 1;
    } else if (r.mismatch) {
      findings.push({
        kind: "mismatch",
        candidateId: r.candidateId,
        detail: r.detail,
        severity: "critical",
      });
      mismatches += 1;
    } else if (r.ok && r.lifecycleAfter === P187_TO_STATE) {
      findings.push({
        kind: "match",
        candidateId: r.candidateId,
        detail: "Legacy/P186 agree on OPERATOR_APPROVED",
        severity: "info",
      });
      matches += 1;
    }

    if (r.duplicateTransition) {
      duplicateTransitions += 1;
      findings.push({
        kind: "duplicate_transition",
        candidateId: r.candidateId,
        detail: "Duplicate HR→OA transition detected",
        severity: "critical",
      });
    }
    if (r.skippedTransition && !r.ok) {
      skippedTransitions += 1;
      findings.push({
        kind: "skipped_transition",
        candidateId: r.candidateId,
        detail: "Transition skipped or not applied",
        severity: "warning",
      });
    }
    if (r.invalidStateChange) {
      invalidStateChanges += 1;
      findings.push({
        kind: "invalid_state_change",
        candidateId: r.candidateId,
        detail: `Invalid advancement to ${r.productionAfter}`,
        severity: "critical",
      });
    }
    if (!r.auditId) {
      auditGaps += 1;
      findings.push({
        kind: "audit_gap",
        candidateId: r.candidateId,
        detail: "Missing audit id",
        severity: "warning",
      });
    }
  }

  const evaluated = input.results.length;
  const transitioned = input.results.filter((r) => r.ok).length;

  return {
    generatedAt: new Date().toISOString(),
    candidatesEvaluated: evaluated,
    candidatesTransitioned: transitioned,
    matches,
    mismatches,
    duplicateTransitions,
    skippedTransitions,
    invalidStateChanges,
    auditGaps,
    findings,
    successRate: evaluated === 0 ? 0 : transitioned / evaluated,
  };
}
