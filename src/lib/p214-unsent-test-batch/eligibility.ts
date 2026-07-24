import {
  P214_REVIEW_MAX_MILES,
  P214_TIER1_MAX_MILES,
  P214_TIER2_MAX_MILES,
  type P214Classification,
  type P214CoverageTier,
  type P214GateEvidence,
} from "@/lib/p214-unsent-test-batch/types";

export function p214TierForMiles(miles: number | null): P214CoverageTier {
  if (miles == null) return "out_of_range";
  if (miles <= P214_TIER1_MAX_MILES) return "tier1_0_20";
  if (miles <= P214_TIER2_MAX_MILES) return "tier2_21_39";
  if (miles <= P214_REVIEW_MAX_MILES) return "review_40_60";
  return "out_of_range";
}

export type P214GateResult = {
  eligible: boolean;
  tier: P214CoverageTier;
  blockers: P214Classification[];
};

/**
 * Coverage + routing gates for candidates whose send history is already
 * UNSENT_CONFIRMED. All blockers are collected (not short-circuited) so the
 * preview can report every reason.
 */
export function evaluateP214Gates(e: P214GateEvidence): P214GateResult {
  const blockers: P214Classification[] = [];
  const tier = p214TierForMiles(e.nearestActiveWorkMiles);

  if (!e.hasActiveOpportunities) {
    blockers.push("blocked_no_active_work");
  } else if (!e.coverageKnown || e.nearestActiveWorkMiles == null) {
    blockers.push("blocked_coverage_unknown");
  } else if (e.nearestActiveWorkMiles > P214_REVIEW_MAX_MILES) {
    blockers.push("blocked_over_60_miles");
  } else if (e.nearestActiveWorkMiles > P214_TIER2_MAX_MILES) {
    // 40–60 miles requires manual review — never auto-included.
    blockers.push("manual_review_40_60_miles");
  }

  const assigned = e.assignedDm.trim();
  const expected = e.expectedDm.trim();
  if (!assigned || /^unassigned$/i.test(assigned)) {
    blockers.push("blocked_dm_unassigned");
  } else if (expected && assigned.toLowerCase() !== expected.toLowerCase()) {
    blockers.push("blocked_dm_wrong");
  }

  const hasGeoPosting = Boolean(e.jobCity.trim() && e.jobState.trim());
  if (!hasGeoPosting && !e.marketIndependentlyVerified) {
    blockers.push("blocked_non_geographic_posting");
  }

  return { eligible: blockers.length === 0, tier, blockers };
}
