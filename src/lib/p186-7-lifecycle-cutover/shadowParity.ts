import type { P1867ShadowParityReport } from "@/lib/p186-7-lifecycle-cutover/types";
import { readShadowMatchThreshold } from "@/lib/p186-7-lifecycle-cutover/flags";

export type ShadowObservationRow = {
  candidateId: string;
  productionState: string | null;
  shadowState: string | null;
  match: boolean;
  missingShadow: boolean;
  impossibleTransition: boolean;
  staleEvent: boolean;
  duplicateWriterEvent: boolean;
  auditGap: boolean;
  ownershipConflict: boolean;
  critical: boolean;
  sourceLagMs?: number | null;
};

/**
 * Build shadow parity observation report from evaluated rows (read-only).
 */
export function buildShadowParityReport(
  rows: ShadowObservationRow[],
): P1867ShadowParityReport {
  const candidatesEvaluated = rows.length;
  const matches = rows.filter((r) => r.match).length;
  const mismatches = rows.filter((r) => !r.match && !r.missingShadow).length;
  const missingShadowRecords = rows.filter((r) => r.missingShadow).length;
  const impossibleTransitions = rows.filter((r) => r.impossibleTransition).length;
  const staleEvents = rows.filter((r) => r.staleEvent).length;
  const duplicateWriterEvents = rows.filter((r) => r.duplicateWriterEvent).length;
  const auditGaps = rows.filter((r) => r.auditGap).length;
  const ownershipConflicts = rows.filter((r) => r.ownershipConflict).length;
  const criticalMismatches = rows.filter((r) => r.critical).length;
  const lags = rows
    .map((r) => r.sourceLagMs)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  const sourceLagMs = lags.length ? Math.max(...lags) : null;
  const matchRate =
    candidatesEvaluated === 0 ? 1 : matches / candidatesEvaluated;

  return {
    candidatesEvaluated,
    matches,
    mismatches,
    missingShadowRecords,
    impossibleTransitions,
    staleEvents,
    duplicateWriterEvents,
    sourceLagMs,
    auditGaps,
    ownershipConflicts,
    matchRate,
    criticalMismatches,
  };
}

export function shadowParityPassesThreshold(report: P1867ShadowParityReport): boolean {
  return (
    report.matchRate >= readShadowMatchThreshold() && report.criticalMismatches === 0
  );
}

/**
 * Synthetic empty/placeholder observation when no production sample is loaded.
 * Used for readiness planning without production cutover.
 */
export function emptyShadowParityReport(): P1867ShadowParityReport {
  return buildShadowParityReport([]);
}

/**
 * Demo/fixture observation for tests — not production data.
 */
export function fixtureShadowParityNearPerfect(): P1867ShadowParityReport {
  const rows: ShadowObservationRow[] = Array.from({ length: 100 }, (_, i) => ({
    candidateId: `c${i}`,
    productionState: "Paperwork Needed",
    shadowState: "PAPERWORK_NEEDED",
    match: i < 97,
    missingShadow: false,
    impossibleTransition: false,
    staleEvent: false,
    duplicateWriterEvent: false,
    auditGap: false,
    ownershipConflict: false,
    critical: false,
    sourceLagMs: 1200,
  }));
  // 3 non-critical mismatches → 0.97 rate
  for (let i = 97; i < 100; i++) {
    rows[i]!.match = false;
  }
  return buildShadowParityReport(rows);
}

export function fixtureShadowParityWithCritical(): P1867ShadowParityReport {
  const base = fixtureShadowParityNearPerfect();
  return {
    ...base,
    criticalMismatches: 2,
    mismatches: base.mismatches + 2,
  };
}
