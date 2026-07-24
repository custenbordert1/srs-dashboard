import { evaluateP214Gates, p214TierForMiles } from "@/lib/p214-unsent-test-batch/eligibility";
import { haversineMiles } from "@/lib/mel-matching/distance-utils";
import type { P235ProximityResult } from "@/lib/p235-controlled-newest-five-send/types";

export type P235OppPoint = {
  city: string;
  state: string;
  lat: number;
  lng: number;
};

export function evaluateP235Proximity(input: {
  home: { lat: number; lng: number } | null;
  assignedDm: string;
  expectedDm: string;
  jobCity: string;
  jobState: string;
  opportunities: P235OppPoint[];
}): P235ProximityResult {
  let nearestMiles: number | null = null;
  let nearestWork: { city: string; state: string } | null = null;
  const coverageKnown = Boolean(input.home);

  if (input.home) {
    for (const opp of input.opportunities) {
      const miles = haversineMiles(input.home, { lat: opp.lat, lng: opp.lng });
      if (nearestMiles == null || miles < nearestMiles) {
        nearestMiles = Math.round(miles * 10) / 10;
        nearestWork = { city: opp.city, state: opp.state };
      }
    }
  }

  const hasActiveOpportunities = input.opportunities.length > 0 && nearestMiles != null;
  const gates = evaluateP214Gates({
    nearestActiveWorkMiles: nearestMiles,
    hasActiveOpportunities: input.opportunities.length > 0,
    coverageKnown,
    assignedDm: input.assignedDm,
    expectedDm: input.expectedDm,
    jobCity: input.jobCity,
    jobState: input.jobState,
  });

  const tier = p214TierForMiles(nearestMiles);
  const autoEligible =
    gates.eligible &&
    nearestMiles != null &&
    nearestMiles <= 39 &&
    !gates.blockers.includes("manual_review_40_60_miles") &&
    !gates.blockers.includes("blocked_over_60_miles") &&
    !gates.blockers.includes("blocked_coverage_unknown");

  return {
    nearestMiles,
    coverageTier: tier,
    coverageKnown,
    hasActiveOpportunities,
    nearestWork,
    autoEligible,
    blockers: gates.blockers,
  };
}

export function classifyP235ProximityExclusion(
  proximity: P235ProximityResult,
): {
  reason:
    | "manual_review_40_60"
    | "blocked_over_60"
    | "coverage_unknown"
    | "no_active_work"
    | null;
  detail: string;
} {
  if (proximity.blockers.includes("manual_review_40_60_miles") || proximity.coverageTier === "review_40_60") {
    return {
      reason: "manual_review_40_60",
      detail: `distance=${proximity.nearestMiles} tier=${proximity.coverageTier}`,
    };
  }
  if (proximity.blockers.includes("blocked_over_60_miles") || proximity.coverageTier === "out_of_range") {
    if (proximity.nearestMiles == null && !proximity.coverageKnown) {
      return {
        reason: "coverage_unknown",
        detail: "coverage unknown / nearest miles null",
      };
    }
    return {
      reason: "blocked_over_60",
      detail: `distance=${proximity.nearestMiles} tier=${proximity.coverageTier}`,
    };
  }
  if (
    proximity.blockers.includes("blocked_coverage_unknown") ||
    !proximity.coverageKnown ||
    proximity.nearestMiles == null
  ) {
    return {
      reason: "coverage_unknown",
      detail: `coverageKnown=${proximity.coverageKnown} miles=${proximity.nearestMiles}`,
    };
  }
  if (proximity.blockers.includes("blocked_no_active_work") || !proximity.hasActiveOpportunities) {
    return {
      reason: "no_active_work",
      detail: "no active unassigned MEL opportunities within resolvable distance",
    };
  }
  if (!proximity.autoEligible) {
    return {
      reason: "coverage_unknown",
      detail: `not auto-eligible: ${proximity.blockers.join(",") || "unknown"}`,
    };
  }
  return { reason: null, detail: "auto_eligible" };
}
