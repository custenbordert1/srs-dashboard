/**
 * P229 — Routing score, market analysis, operational impact (pure).
 */

import { isP223OperationallyActiveWorkflowStage } from "@/lib/p223-recruiter-inbox-restoration";
import { isUnassignedDm } from "@/lib/p224-controlled-preview/eligibility";
import { evaluateP228EligibilityBlockers } from "@/lib/p228-production-readiness/eligibility";
import type { P228CandidateSnapshot } from "@/lib/p228-production-readiness/types";
import {
  emptyCategoryCounts,
  extractRoutingBlockers,
} from "@/lib/p229-routing-recovery-analysis/classify";
import type {
  P229CandidateOpportunity,
  P229CategoryCounts,
  P229MarketRow,
  P229OperationalImpact,
  P229RoutingScoreSnapshot,
  P229StateMarketRow,
} from "@/lib/p229-routing-recovery-analysis/types";

function levelFromScore(score: number): "Low" | "Medium" | "High" {
  if (score >= 75) return "Low";
  if (score >= 50) return "Medium";
  return "High";
}

/** Match P228 assessRisk routing_quality formula. */
export function computeP229RoutingScore(
  snapshots: P228CandidateSnapshot[],
): P229RoutingScoreSnapshot {
  const active = snapshots.filter((c) =>
    isP223OperationallyActiveWorkflowStage(c.workflowStatus),
  );
  const n = Math.max(1, active.length);
  let coverageUnknownCount = 0;
  let missingDmCount = 0;
  let missingLocationCount = 0;
  let over60Count = 0;

  for (const c of active) {
    const blockers = evaluateP228EligibilityBlockers(c);
    if (blockers.includes("coverage_unknown")) coverageUnknownCount += 1;
    if (blockers.includes("missing_assigned_dm")) missingDmCount += 1;
    if (blockers.includes("missing_location")) missingLocationCount += 1;
    if (blockers.includes("over_60_miles")) over60Count += 1;
  }

  const coverageUnknownPct = coverageUnknownCount / n;
  const missingDmPct = missingDmCount / n;
  // P228 uses assignment-based missing DM pct + coverageKnown for risk input;
  // eligibility-blocker counts are reported alongside for transparency.
  const assignmentMissingDmPct =
    active.filter((c) => isUnassignedDm(c.assignedDM)).length / n;
  const coverageUnknownKnownPct =
    active.filter((c) => !c.coverageKnown || c.coverageTier === "unknown").length / n;

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        90 -
          coverageUnknownKnownPct * 40 -
          assignmentMissingDmPct * 35 -
          Math.min(20, over60Count),
      ),
    ),
  );

  return {
    score,
    level: levelFromScore(score),
    coverageUnknownCount,
    coverageUnknownPct,
    missingDmCount,
    missingDmPct,
    missingLocationCount,
    over60Count,
    workflowActive: active.length,
  };
}

export function analyzeP229Markets(opportunities: P229CandidateOpportunity[]): {
  topRecoverableStates: P229StateMarketRow[];
  topRecoverableCities: P229MarketRow[];
  highestCoverageUnknown: P229StateMarketRow[];
  highestMissingDm: P229StateMarketRow[];
  highestMissingLocation: P229StateMarketRow[];
} {
  const byState = new Map<string, P229StateMarketRow>();
  const byCity = new Map<string, P229MarketRow>();

  function stateRow(state: string): P229StateMarketRow {
    const key = state || "UNKNOWN";
    let row = byState.get(key);
    if (!row) {
      row = {
        state: key,
        blockedTotal: 0,
        coverageUnknown: 0,
        missingAssignedDm: 0,
        missingLocation: 0,
        recoverableTotal: 0,
        byCategory: emptyCategoryCounts(),
      };
      byState.set(key, row);
    }
    return row;
  }

  function cityRow(city: string, state: string): P229MarketRow {
    const s = state || "UNKNOWN";
    const c = city || "(unknown city)";
    const key = `${c}|${s}`.toLowerCase();
    let row = byCity.get(key);
    if (!row) {
      row = {
        state: s,
        city: c,
        blockedTotal: 0,
        coverageUnknown: 0,
        missingAssignedDm: 0,
        missingLocation: 0,
        recoverableA: 0,
        recoverableB: 0,
        recoverableC: 0,
        recoverableD: 0,
        operatorReviewE: 0,
        notRecoverableF: 0,
      };
      byCity.set(key, row);
    }
    return row;
  }

  for (const opp of opportunities) {
    const state = (
      (opp.locationProposal.wouldChange
        ? opp.locationProposal.proposedState
        : opp.state) ||
      opp.state ||
      "UNKNOWN"
    ).toUpperCase();
    const city =
      (opp.locationProposal.wouldChange
        ? opp.locationProposal.proposedCity
        : opp.city) ||
      opp.city ||
      "";

    const sr = stateRow(state);
    sr.blockedTotal += 1;
    sr.byCategory[opp.primaryCategory] += 1;
    if (["A", "B", "C", "D"].includes(opp.primaryCategory)) sr.recoverableTotal += 1;
    if (opp.routingBlockers.includes("coverage_unknown")) sr.coverageUnknown += 1;
    if (opp.routingBlockers.includes("missing_assigned_dm")) sr.missingAssignedDm += 1;
    if (opp.routingBlockers.includes("missing_location")) sr.missingLocation += 1;

    const cr = cityRow(city, state);
    cr.blockedTotal += 1;
    if (opp.routingBlockers.includes("coverage_unknown")) cr.coverageUnknown += 1;
    if (opp.routingBlockers.includes("missing_assigned_dm")) cr.missingAssignedDm += 1;
    if (opp.routingBlockers.includes("missing_location")) cr.missingLocation += 1;
    if (opp.primaryCategory === "A") cr.recoverableA += 1;
    if (opp.primaryCategory === "B") cr.recoverableB += 1;
    if (opp.primaryCategory === "C") cr.recoverableC += 1;
    if (opp.primaryCategory === "D") cr.recoverableD += 1;
    if (opp.primaryCategory === "E") cr.operatorReviewE += 1;
    if (opp.primaryCategory === "F") cr.notRecoverableF += 1;
  }

  const states = [...byState.values()];
  const cities = [...byCity.values()];

  return {
    topRecoverableStates: [...states]
      .sort((a, b) => b.recoverableTotal - a.recoverableTotal || b.blockedTotal - a.blockedTotal)
      .slice(0, 12),
    topRecoverableCities: [...cities]
      .sort(
        (a, b) =>
          b.recoverableA +
            b.recoverableB +
            b.recoverableC +
            b.recoverableD -
            (a.recoverableA + a.recoverableB + a.recoverableC + a.recoverableD) ||
          b.blockedTotal - a.blockedTotal,
      )
      .slice(0, 15),
    highestCoverageUnknown: [...states]
      .sort((a, b) => b.coverageUnknown - a.coverageUnknown)
      .slice(0, 10),
    highestMissingDm: [...states]
      .sort((a, b) => b.missingAssignedDm - a.missingAssignedDm)
      .slice(0, 10),
    highestMissingLocation: [...states]
      .sort((a, b) => b.missingLocation - a.missingLocation)
      .slice(0, 10),
  };
}

export function estimateP229OperationalImpact(args: {
  categoryCounts: P229CategoryCounts;
  eligibilityIncrease: number;
  routingClearedIncrease: number;
  potentialSendReadyIfPaperworkNeeded: number;
  opportunities: P229CandidateOpportunity[];
}): P229OperationalImpact {
  const autoOrAuth =
    args.categoryCounts.A +
    args.categoryCounts.B +
    args.categoryCounts.C +
    args.categoryCounts.D;

  const additionalPaperworkCandidates = Math.max(
    args.eligibilityIncrease,
    Math.min(args.potentialSendReadyIfPaperworkNeeded, autoOrAuth),
  );
  const low = Math.min(5, additionalPaperworkCandidates);
  const high = Math.min(20, Math.max(low, Math.floor(additionalPaperworkCandidates * 0.25)));

  const dmRecoverable = args.opportunities.filter(
    (o) => o.dmProposal.wouldChange && o.primaryCategory !== "F",
  ).length;

  return {
    additionalPaperworkCandidates,
    additionalWeeklyOnboardingCapacityLow: low,
    additionalWeeklyOnboardingCapacityHigh: high,
    expectedRecruiterWorkloadDelta:
      "Recruiter assignment out of scope — no change from P229. missing_recruiter remains a residual soft blocker.",
    expectedDmWorkloadDelta: `If DM routing were applied later, ~${dmRecoverable} additional named DM assignments would redistribute Unassigned queue; this preview does not assign.`,
    notes: [
      `Routing-cleared increase (in-memory sim): ${args.routingClearedIncrease}.`,
      `Potential send-ready if transitioned to Paperwork Needed: ${args.potentialSendReadyIfPaperworkNeeded}.`,
      "Estimates only — no workflow transitions or sends in P229.",
    ],
  };
}

export function buildP229EngineeringPriorities(args: {
  categoryCounts: P229CategoryCounts;
  routingCurrent: P229RoutingScoreSnapshot;
  routingProjected: P229RoutingScoreSnapshot;
}): string[] {
  const priorities: string[] = [];
  if (args.categoryCounts.C > 0) {
    priorities.push(
      `Repair Position.Location for ~${args.categoryCounts.C} candidates (category C) — unlocks DM routing and coverage.`,
    );
  }
  if (args.categoryCounts.B > 0) {
    priorities.push(
      `Refresh validated geocode cache for ~${args.categoryCounts.B} candidates with known location but cache miss (category B).`,
    );
  }
  if (args.categoryCounts.D > 0 || args.categoryCounts.A > 0) {
    priorities.push(
      `Apply P216 territory DM routing for Unassigned DMs where state is known (A/D ≈ ${args.categoryCounts.A + args.categoryCounts.D}) — preview only in P229.`,
    );
  }
  if (args.categoryCounts.E > 0) {
    priorities.push(
      `Operator review queue for ~${args.categoryCounts.E} ambiguous location/DM conflicts (category E).`,
    );
  }
  priorities.push(
    `Routing score ${args.routingCurrent.score} → ${args.routingProjected.score} under authoritative in-memory recoveries; live writes are a later phase.`,
  );
  priorities.push(
    "Keep recruiter assignment out of routing recovery scope; treat missing_recruiter as a separate ownership workstream.",
  );
  return priorities;
}

export function countRoutingBlockers(snapshots: P228CandidateSnapshot[]): {
  coverage_unknown: number;
  missing_assigned_dm: number;
  missing_location: number;
} {
  const out = { coverage_unknown: 0, missing_assigned_dm: 0, missing_location: 0 };
  for (const c of snapshots) {
    if (!isP223OperationallyActiveWorkflowStage(c.workflowStatus)) continue;
    for (const b of extractRoutingBlockers(evaluateP228EligibilityBlockers(c))) {
      out[b] += 1;
    }
  }
  return out;
}
