import type {
  P1866AgingBand,
  P1866AgingResult,
  P1866CohortCandidate,
  P1866FunnelStage,
} from "@/lib/p186-6-executive-recruiting-intelligence/types";

/** Stage-specific thresholds in ms: healthy < warning < overdue < critical */
export type AgingThresholds = Record<
  P1866FunnelStage,
  { warningMs: number; overdueMs: number; criticalMs: number }
>;

export const DEFAULT_AGING_THRESHOLDS: AgingThresholds = {
  APPLIED: { warningMs: 2 * 86400000, overdueMs: 5 * 86400000, criticalMs: 10 * 86400000 },
  RECRUITER_REVIEW: { warningMs: 1 * 86400000, overdueMs: 3 * 86400000, criticalMs: 7 * 86400000 },
  HIRING_RECOMMENDATION: { warningMs: 1 * 86400000, overdueMs: 3 * 86400000, criticalMs: 5 * 86400000 },
  OPERATOR_APPROVED: { warningMs: 12 * 3600000, overdueMs: 2 * 86400000, criticalMs: 4 * 86400000 },
  PAPERWORK_NEEDED: { warningMs: 1 * 86400000, overdueMs: 3 * 86400000, criticalMs: 5 * 86400000 },
  PAPERWORK_SENT: { warningMs: 2 * 86400000, overdueMs: 5 * 86400000, criticalMs: 10 * 86400000 },
  PAPERWORK_VIEWED: { warningMs: 1 * 86400000, overdueMs: 3 * 86400000, criticalMs: 7 * 86400000 },
  PAPERWORK_SIGNED: { warningMs: 1 * 86400000, overdueMs: 3 * 86400000, criticalMs: 7 * 86400000 },
  ONBOARDING_COMPLETE: { warningMs: 1 * 86400000, overdueMs: 3 * 86400000, criticalMs: 5 * 86400000 },
  READY_FOR_MEL: { warningMs: 1 * 86400000, overdueMs: 3 * 86400000, criticalMs: 7 * 86400000 },
  MEL_EXPORT_REVIEW: { warningMs: 1 * 86400000, overdueMs: 3 * 86400000, criticalMs: 5 * 86400000 },
  EXPORTED: { warningMs: 30 * 86400000, overdueMs: 90 * 86400000, criticalMs: 180 * 86400000 },
};

function bandFor(ageMs: number, t: { warningMs: number; overdueMs: number; criticalMs: number }): P1866AgingBand {
  if (ageMs >= t.criticalMs) return "critical";
  if (ageMs >= t.overdueMs) return "overdue";
  if (ageMs >= t.warningMs) return "warning";
  return "healthy";
}

function breachMs(ageMs: number, band: P1866AgingBand, t: { warningMs: number; overdueMs: number; criticalMs: number }): number {
  if (band === "critical") return Math.max(0, ageMs - t.criticalMs);
  if (band === "overdue") return Math.max(0, ageMs - t.overdueMs);
  if (band === "warning") return Math.max(0, ageMs - t.warningMs);
  return 0;
}

function actionFor(stage: P1866FunnelStage, band: P1866AgingBand): string {
  if (band === "healthy") return "Monitor";
  switch (stage) {
    case "RECRUITER_REVIEW":
      return "Nudge recruiter review";
    case "OPERATOR_APPROVED":
    case "HIRING_RECOMMENDATION":
      return "Escalate operator approval";
    case "PAPERWORK_NEEDED":
      return "Authorize paperwork batch (P185) — advisory only";
    case "PAPERWORK_SENT":
    case "PAPERWORK_VIEWED":
      return "Follow up on signature";
    case "PAPERWORK_SIGNED":
      return "Complete onboarding review";
    case "READY_FOR_MEL":
    case "MEL_EXPORT_REVIEW":
      return "Review MEL export readiness";
    default:
      return "Investigate aging breach";
  }
}

/**
 * Aging model — observe only; never advances candidates.
 */
export function calculateAging(input: {
  cohort: P1866CohortCandidate[];
  thresholds?: AgingThresholds;
  nowMs?: number;
}): P1866AgingResult[] {
  const now = input.nowMs ?? Date.now();
  const thresholds = input.thresholds ?? DEFAULT_AGING_THRESHOLDS;
  return input.cohort.map((c) => {
    const ageMs = Math.max(0, now - Date.parse(c.stageEnteredAt));
    const t = thresholds[c.funnelStage];
    const band = bandFor(ageMs, t);
    return {
      candidateId: c.candidateId,
      stage: c.funnelStage,
      ageMs,
      band,
      breachDurationMs: breachMs(ageMs, band, t),
      owner: c.recruiter ?? c.dm ?? c.operator ?? null,
      blocker: c.blockers?.[0] ?? (c.blocked ? "blocked" : null),
      recommendedNextAction: actionFor(c.funnelStage, band),
      sourceFreshnessMs: c.sourceFreshnessMs ?? null,
    };
  });
}

export function summarizeAgingBands(results: P1866AgingResult[]): Record<P1866AgingBand, number> {
  const out: Record<P1866AgingBand, number> = {
    healthy: 0,
    warning: 0,
    overdue: 0,
    critical: 0,
  };
  for (const r of results) out[r.band] += 1;
  return out;
}
