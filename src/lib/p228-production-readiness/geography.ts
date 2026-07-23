import { isP223OperationallyActiveWorkflowStage } from "@/lib/p223-recruiter-inbox-restoration";
import { isP228SendEligible } from "@/lib/p228-production-readiness/eligibility";
import type {
  P228CandidateSnapshot,
  P228GeographicCoverage,
} from "@/lib/p228-production-readiness/types";

export function assessGeography(
  candidates: P228CandidateSnapshot[],
): P228GeographicCoverage {
  const byState = new Map<
    string,
    { total: number; eligible: number; over60: number; unknown: number }
  >();

  for (const c of candidates) {
    if (!isP223OperationallyActiveWorkflowStage(c.workflowStatus)) continue;
    const state = (c.state || "UNKNOWN").toUpperCase();
    const row = byState.get(state) ?? { total: 0, eligible: 0, over60: 0, unknown: 0 };
    row.total += 1;
    if (isP228SendEligible(c)) row.eligible += 1;
    if (c.coverageTier === "out_of_range" || (c.nearestActiveWorkMiles != null && c.nearestActiveWorkMiles > 60)) {
      row.over60 += 1;
    }
    if (!c.coverageKnown || c.coverageTier === "unknown") row.unknown += 1;
    byState.set(state, row);
  }

  const scored = [...byState.entries()].map(([state, r]) => ({
    state,
    eligible: r.eligible,
    total: r.total,
    score: r.total === 0 ? 0 : Math.round((r.eligible / r.total) * 100),
    over60: r.over60,
    unknown: r.unknown,
  }));

  const strongestStates = [...scored]
    .filter((s) => s.total >= 2)
    .sort((a, b) => b.score - a.score || b.eligible - a.eligible)
    .slice(0, 8)
    .map(({ state, eligible, total, score }) => ({ state, eligible, total, score }));

  const weakestStates = [...scored]
    .filter((s) => s.total >= 2)
    .sort((a, b) => a.score - b.score || b.total - a.total)
    .slice(0, 8)
    .map(({ state, eligible, total, score }) => ({ state, eligible, total, score }));

  const marketsOver60 = scored
    .filter((s) => s.over60 > 0)
    .sort((a, b) => b.over60 - a.over60)
    .map((s) => ({ state: s.state, count: s.over60 }));

  const coverageUnknown = scored
    .filter((s) => s.unknown > 0)
    .sort((a, b) => b.unknown - a.unknown)
    .map((s) => ({ state: s.state, count: s.unknown }));

  const zeroEligible = scored
    .filter((s) => s.eligible === 0 && s.total > 0)
    .sort((a, b) => b.total - a.total)
    .map((s) => ({ state: s.state, total: s.total }));

  return {
    strongestStates,
    weakestStates,
    marketsOver60,
    coverageUnknown,
    zeroEligible,
  };
}
