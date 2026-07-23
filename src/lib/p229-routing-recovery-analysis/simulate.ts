/**
 * P229 — Authoritative proposal builders + eligibility simulation (pure helpers).
 * Callers supply geocode/distance results; this module never invents values.
 */

import { getDmForState } from "@/lib/dm-territory-map";
import { resolveP216Routing } from "@/lib/p216-position-location-authority";
import {
  assessEligibility,
  hasUsableLocation,
  isP228SendEligible,
  resolveCoverageTier,
} from "@/lib/p228-production-readiness/eligibility";
import type { P228CandidateSnapshot } from "@/lib/p228-production-readiness/types";
import { isUnassignedDm } from "@/lib/p224-controlled-preview/eligibility";
import {
  applyP229SimulatedSnapshot,
  emptyCategoryCounts,
  extractRoutingBlockers,
} from "@/lib/p229-routing-recovery-analysis/classify";
import type {
  P229BatchFeasibility,
  P229BatchSize,
  P229CandidateOpportunity,
  P229CategoryCounts,
  P229CoverageProposal,
  P229DmProposal,
  P229EligibilitySimulation,
  P229LocationProposal,
} from "@/lib/p229-routing-recovery-analysis/types";
import { P229_BATCH_OPTIONS as BATCH_OPTIONS } from "@/lib/p229-routing-recovery-analysis/types";

export type P229LocationEvidence = {
  cities: string[];
  states: string[];
  zips: string[];
  sources: string[];
};

function uniqueCi(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/**
 * Propose location recovery from authoritative evidence only.
 * Ambiguous distinct city/state pairs → no proposal.
 */
export function proposeP229Location(args: {
  currentCity: string;
  currentState: string;
  currentZip: string;
  evidence: P229LocationEvidence;
}): P229LocationProposal {
  const currentCity = String(args.currentCity ?? "").trim();
  const currentState = String(args.currentState ?? "").trim().toUpperCase();
  const currentZip = String(args.currentZip ?? "").trim();

  if (hasUsableLocation(currentCity, currentState)) {
    return {
      currentCity,
      currentState,
      currentZip,
      proposedCity: null,
      proposedState: null,
      proposedZip: null,
      wouldChange: false,
      authoritativeSource: null,
      ambiguous: false,
      conflictingValues: [],
    };
  }

  const cities = uniqueCi(args.evidence.cities);
  const states = uniqueCi(args.evidence.states).map((s) => s.toUpperCase());
  const zips = uniqueCi(args.evidence.zips);

  // Pair-wise: if multiple cities or states, ambiguous unless single of each.
  if (cities.length > 1 || states.length > 1) {
    const conflicts = [
      ...cities.map((c) => `city:${c}`),
      ...states.map((s) => `state:${s}`),
    ];
    return {
      currentCity,
      currentState,
      currentZip,
      proposedCity: null,
      proposedState: null,
      proposedZip: null,
      wouldChange: false,
      authoritativeSource: null,
      ambiguous: true,
      conflictingValues: conflicts,
    };
  }

  const proposedCity = cities[0] ?? null;
  const proposedState = states[0] ?? null;
  const proposedZip = zips[0] ?? null;

  if (!proposedCity || !proposedState) {
    return {
      currentCity,
      currentState,
      currentZip,
      proposedCity: null,
      proposedState: null,
      proposedZip: null,
      wouldChange: false,
      authoritativeSource: null,
      ambiguous: false,
      conflictingValues: [],
    };
  }

  const source =
    args.evidence.sources.find((s) =>
      /position\.?location|p216|questionnaire|p226|ingestion|breezy/i.test(s),
    ) ||
    args.evidence.sources[0] ||
    "authoritative_durable_candidate_data";

  return {
    currentCity,
    currentState,
    currentZip,
    proposedCity,
    proposedState,
    proposedZip,
    wouldChange: true,
    authoritativeSource: source,
    ambiguous: false,
    conflictingValues: [],
  };
}

export function proposeP229Dm(args: {
  currentAssignedDM: string;
  city: string;
  state: string;
  positionId: string | null;
  positionName: string | null;
  positionStatus: string | null;
  locationSource: string;
  postingAuthoritative: boolean;
  homeCity: string;
  homeState: string;
}): P229DmProposal {
  const current = String(args.currentAssignedDM ?? "").trim() || "Unassigned";

  const routing = resolveP216Routing(
    {
      positionId: args.positionId,
      positionName: args.positionName,
      positionStatus: args.positionStatus,
      city: args.postingAuthoritative ? args.city : "",
      state: args.postingAuthoritative ? args.state : "",
      zip: "",
      displayLocation: "",
      locationSource: args.postingAuthoritative
        ? (args.locationSource as "location.city+location.state")
        : "missing",
      homeCity: args.homeCity,
      homeState: args.homeState,
    },
    (s) => getDmForState(s),
  );

  const expected = routing.expectedDm.trim() || null;
  const routingState = routing.routingState || null;

  if (!isUnassignedDm(current)) {
    if (expected && current.toLowerCase() !== expected.toLowerCase()) {
      return {
        currentAssignedDM: current,
        proposedAssignedDM: null,
        expectedDmFromRouting: expected,
        routingState,
        wouldChange: false,
        authoritativeSource: null,
        ambiguous: true,
      };
    }
    return {
      currentAssignedDM: current,
      proposedAssignedDM: null,
      expectedDmFromRouting: expected,
      routingState,
      wouldChange: false,
      authoritativeSource: expected
        ? "existing_verified_assignment_matches_p216_routing"
        : null,
      ambiguous: false,
    };
  }

  if (!expected) {
    return {
      currentAssignedDM: current,
      proposedAssignedDM: null,
      expectedDmFromRouting: null,
      routingState,
      wouldChange: false,
      authoritativeSource: null,
      ambiguous: false,
    };
  }

  return {
    currentAssignedDM: current,
    proposedAssignedDM: expected,
    expectedDmFromRouting: expected,
    routingState,
    wouldChange: true,
    authoritativeSource: "p216_position_location_territory_routing",
    ambiguous: false,
  };
}

export function proposeP229Coverage(args: {
  currentKnown: boolean;
  currentMiles: number | null;
  currentTier: P228CandidateSnapshot["coverageTier"];
  geocodeCacheHit: boolean;
  computedMiles: number | null;
  locationAvailable: boolean;
}): P229CoverageProposal {
  if (args.currentKnown && args.currentMiles != null) {
    return {
      currentKnown: true,
      currentMiles: args.currentMiles,
      currentTier: args.currentTier,
      proposedKnown: true,
      proposedMiles: args.currentMiles,
      proposedTier: args.currentTier,
      geocodeCacheHit: true,
      needsGeocodeRefresh: false,
      authoritativeSource: "existing_coverage",
    };
  }

  if (args.geocodeCacheHit && args.computedMiles != null) {
    const tier = resolveCoverageTier(args.computedMiles, true);
    return {
      currentKnown: args.currentKnown,
      currentMiles: args.currentMiles,
      currentTier: args.currentTier,
      proposedKnown: true,
      proposedMiles: args.computedMiles,
      proposedTier: tier,
      geocodeCacheHit: true,
      needsGeocodeRefresh: false,
      authoritativeSource: "validated_geocode_cache_haversine",
    };
  }

  return {
    currentKnown: args.currentKnown,
    currentMiles: args.currentMiles,
    currentTier: args.currentTier,
    proposedKnown: false,
    proposedMiles: null,
    proposedTier: "unknown",
    geocodeCacheHit: false,
    needsGeocodeRefresh: args.locationAvailable,
    authoritativeSource: null,
  };
}

export function simulateP229Eligibility(args: {
  allSnapshots: P228CandidateSnapshot[];
  opportunities: P229CandidateOpportunity[];
}): {
  simulatedSnapshots: P228CandidateSnapshot[];
  eligibility: P229EligibilitySimulation;
  categoryCounts: P229CategoryCounts;
} {
  const byId = new Map(args.opportunities.map((o) => [o.candidateId, o]));
  const simulatedSnapshots: P228CandidateSnapshot[] = args.allSnapshots.map((snap) => {
    const opp = byId.get(snap.candidateId);
    if (!opp) return snap;
    return applyP229SimulatedSnapshot(
      snap,
      opp.locationProposal,
      opp.dmProposal,
      opp.coverageProposal,
    );
  });

  const current = assessEligibility(args.allSnapshots);
  const projected = assessEligibility(simulatedSnapshots);

  const routingBlockedCurrent = current.rows.filter(
    (r) => extractRoutingBlockers(r.blockers).length > 0,
  ).length;
  const routingClearedProjected = projected.rows.filter(
    (r) => extractRoutingBlockers(r.blockers).length === 0,
  ).length;
  const routingClearedCurrent = current.rows.filter(
    (r) => extractRoutingBlockers(r.blockers).length === 0,
  ).length;

  // Capacity estimate: hard gates pass if we hypothetically set Paperwork Needed + not_sent.
  let potentialSendReadyIfPaperworkNeeded = 0;
  for (const snap of simulatedSnapshots) {
    const hypothetical: P228CandidateSnapshot = {
      ...snap,
      workflowStatus: "Paperwork Needed",
      paperworkStatus: "not_sent",
      signatureRequestId: null,
    };
    // Skip already signed / terminal-ish identity failures still block.
    if (String(snap.workflowStatus) === "Signed") continue;
    if (isP228SendEligible(hypothetical)) potentialSendReadyIfPaperworkNeeded += 1;
  }

  const categoryCounts = emptyCategoryCounts();
  for (const opp of args.opportunities) {
    categoryCounts[opp.primaryCategory] += 1;
  }

  const batchFeasibility: P229BatchFeasibility[] = (BATCH_OPTIONS as readonly P229BatchSize[]).map(
    (batchSize) => {
      const now = current.totals.eligible >= batchSize;
      const proj = projected.totals.eligible >= batchSize;
      const routingReady = potentialSendReadyIfPaperworkNeeded >= batchSize;
      return {
        batchSize,
        feasibleNow: now,
        feasibleProjected: proj,
        feasibleRoutingReady: routingReady,
        note: now
          ? "Current send-eligible population supports this batch."
          : proj
            ? "Projected send-eligible (after authoritative routing sim) supports this batch."
            : routingReady
              ? "Not send-eligible yet (stage/already_sent), but routing-ready capacity estimate supports this batch if transitioned to Paperwork Needed."
              : "Insufficient population even under routing-ready capacity estimate.",
      };
    },
  );

  return {
    simulatedSnapshots,
    categoryCounts,
    eligibility: {
      currentEligible: current.totals.eligible,
      projectedEligible: projected.totals.eligible,
      increase: projected.totals.eligible - current.totals.eligible,
      workflowActiveEvaluated: current.totals.workflowActiveEvaluated,
      routingBlockedCurrent,
      routingClearedProjected,
      routingClearedIncrease: routingClearedProjected - routingClearedCurrent,
      potentialSendReadyIfPaperworkNeeded,
      remainingBlockersAfterSim: projected.topBlockers,
      batchFeasibility,
    },
  };
}
