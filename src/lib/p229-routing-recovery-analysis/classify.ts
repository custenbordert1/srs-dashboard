/**
 * P229 — Classify routing recovery opportunities (pure, read-only).
 * Never invents values; only uses provided authoritative proposals.
 */

import {
  evaluateP228EligibilityBlockers,
  hasUsableLocation,
  isP228SendEligible,
  isUnassignedRecruiter,
  resolveCoverageTier,
} from "@/lib/p228-production-readiness/eligibility";
import type { P228CandidateSnapshot, P228EligibilityBlocker } from "@/lib/p228-production-readiness/types";
import { isUnassignedDm } from "@/lib/p224-controlled-preview/eligibility";
import {
  P229_ROUTING_BLOCKERS,
  type P229CandidateOpportunity,
  type P229Category,
  type P229CoverageProposal,
  type P229DmProposal,
  type P229LocationProposal,
  type P229RecoveryCapability,
  type P229RoutingBlocker,
} from "@/lib/p229-routing-recovery-analysis/types";

/** Most-blocking category wins as primary (F hardest → A easiest). */
const CATEGORY_RANK: Record<P229Category, number> = {
  F: 6,
  E: 5,
  C: 4,
  B: 3,
  D: 2,
  A: 1,
};

export function extractRoutingBlockers(
  blockers: readonly P228EligibilityBlocker[],
): P229RoutingBlocker[] {
  return P229_ROUTING_BLOCKERS.filter((b) => blockers.includes(b));
}

export function pickPrimaryCategory(categories: P229Category[]): P229Category {
  if (categories.length === 0) return "A";
  return [...categories].sort((a, b) => CATEGORY_RANK[b] - CATEGORY_RANK[a])[0]!;
}

export function recoveryCapabilityFor(category: P229Category): P229RecoveryCapability {
  switch (category) {
    case "A":
      return "automatic";
    case "B":
    case "C":
    case "D":
      return "authoritative_data";
    case "E":
      return "operator_review";
    case "F":
      return "cannot_recover";
  }
}

export type P229ClassifyInput = {
  snapshot: P228CandidateSnapshot;
  locationProposal: P229LocationProposal;
  dmProposal: P229DmProposal;
  coverageProposal: P229CoverageProposal;
  /** True when Position.Location is empty/non-authoritative but a positionId exists. */
  positionLocationNeedsRepair: boolean;
  /** True when Position.Location already has authoritative city+state in durable/Breezy data. */
  positionLocationAuthoritative: boolean;
};

function uniqueCategories(cats: P229Category[]): P229Category[] {
  return [...new Set(cats)];
}

/**
 * Classify a routing-blocked candidate into A–F.
 * Secondary categories capture additional recovery paths.
 */
export function classifyP229Opportunity(input: P229ClassifyInput): {
  primaryCategory: P229Category;
  secondaryCategories: P229Category[];
  recoveryCapability: P229RecoveryCapability;
  notes: string[];
} {
  const { snapshot, locationProposal, dmProposal, coverageProposal } = input;
  const blockers = evaluateP228EligibilityBlockers(snapshot);
  const routing = extractRoutingBlockers(blockers);
  const notes: string[] = [];
  const paths: P229Category[] = [];

  const needsLocation = routing.includes("missing_location");
  const needsDm = routing.includes("missing_assigned_dm");
  const needsCoverage = routing.includes("coverage_unknown");

  if (needsLocation) {
    if (locationProposal.ambiguous) {
      paths.push("E");
      notes.push("Conflicting location values across authoritative sources — operator review.");
    } else if (
      locationProposal.wouldChange &&
      locationProposal.proposedCity &&
      locationProposal.proposedState
    ) {
      if (input.positionLocationNeedsRepair && !input.positionLocationAuthoritative) {
        paths.push("C");
        notes.push(
          "Location recoverable only after Position.Location repair (no authoritative posting geo).",
        );
      } else {
        paths.push("A");
        notes.push(
          `Location recoverable from ${locationProposal.authoritativeSource ?? "authoritative durable data"}.`,
        );
      }
    } else if (input.positionLocationNeedsRepair) {
      paths.push("C");
      notes.push("Missing location and Position.Location is empty — repair posting geography.");
    } else {
      paths.push("F");
      notes.push("No authoritative city/state found in durable candidate or Position.Location data.");
    }
  }

  const simState =
    (locationProposal.wouldChange ? locationProposal.proposedState : snapshot.state) ||
    dmProposal.routingState ||
    "";
  const simCity =
    (locationProposal.wouldChange ? locationProposal.proposedCity : snapshot.city) || "";

  if (needsDm) {
    if (dmProposal.ambiguous) {
      paths.push("E");
      notes.push("DM assignment conflicts with P216 expected routing — operator review.");
    } else if (!hasUsableLocation(simCity, simState) && !locationProposal.wouldChange) {
      if (input.positionLocationNeedsRepair) {
        paths.push("C");
        notes.push("DM routing blocked until Position.Location / home geography exists.");
      } else if (!needsLocation) {
        paths.push("F");
        notes.push("Cannot derive DM — no routing state available.");
      }
    } else if (dmProposal.wouldChange && dmProposal.proposedAssignedDM) {
      paths.push("D");
      notes.push(`DM recoverable via P216 territory routing → ${dmProposal.proposedAssignedDM}.`);
    } else if (isUnassignedDm(snapshot.assignedDM)) {
      paths.push("F");
      notes.push("State not mapped in approved territory table — cannot auto-assign DM.");
    }
  }

  if (needsCoverage) {
    const locationWillExist =
      hasUsableLocation(simCity, simState) ||
      (locationProposal.wouldChange &&
        Boolean(locationProposal.proposedCity && locationProposal.proposedState));

    if (!locationWillExist) {
      if (input.positionLocationNeedsRepair) {
        paths.push("C");
        notes.push("Coverage unknown until Position.Location / home geo is repaired.");
      } else if (locationProposal.ambiguous) {
        paths.push("E");
      } else {
        paths.push("F");
        notes.push("Coverage cannot be computed without authoritative location.");
      }
    } else if (coverageProposal.geocodeCacheHit && coverageProposal.proposedKnown) {
      paths.push("A");
      notes.push("Coverage recoverable from validated geocode cache + MEL opportunity distances.");
    } else if (coverageProposal.needsGeocodeRefresh) {
      paths.push("B");
      notes.push("Location present/recoverable but validated geocode cache miss — refresh required.");
    } else {
      paths.push("F");
      notes.push("No path to compute coverage (no cache hit and refresh not applicable).");
    }
  }

  const uniq = uniqueCategories(paths.length ? paths : ["A"]);
  const primary = pickPrimaryCategory(uniq);
  const secondary = uniq.filter((c) => c !== primary);

  if (isUnassignedRecruiter(snapshot.assignedRecruiter)) {
    notes.push("missing_recruiter remains out of scope for P229 recovery (report-only).");
  }

  return {
    primaryCategory: primary,
    secondaryCategories: secondary,
    recoveryCapability: recoveryCapabilityFor(primary),
    notes,
  };
}

/**
 * Apply only authoritative in-memory recoveries (never invents geocode/location).
 */
export function applyP229SimulatedSnapshot(
  snapshot: P228CandidateSnapshot,
  locationProposal: P229LocationProposal,
  dmProposal: P229DmProposal,
  coverageProposal: P229CoverageProposal,
): P228CandidateSnapshot {
  const city =
    locationProposal.wouldChange && locationProposal.proposedCity
      ? locationProposal.proposedCity
      : snapshot.city;
  const state =
    locationProposal.wouldChange && locationProposal.proposedState
      ? locationProposal.proposedState
      : snapshot.state;
  const zip =
    locationProposal.wouldChange && locationProposal.proposedZip
      ? locationProposal.proposedZip
      : snapshot.zip;

  const assignedDM =
    dmProposal.wouldChange && dmProposal.proposedAssignedDM
      ? dmProposal.proposedAssignedDM
      : snapshot.assignedDM;

  const coverageKnown =
    coverageProposal.geocodeCacheHit && coverageProposal.proposedKnown
      ? true
      : snapshot.coverageKnown;
  const nearestActiveWorkMiles =
    coverageProposal.geocodeCacheHit && coverageProposal.proposedKnown
      ? coverageProposal.proposedMiles
      : snapshot.nearestActiveWorkMiles;
  const coverageTier = resolveCoverageTier(nearestActiveWorkMiles, coverageKnown);

  return {
    ...snapshot,
    city,
    state,
    zip,
    assignedDM,
    coverageKnown,
    nearestActiveWorkMiles,
    coverageTier,
    recoveredDm:
      snapshot.recoveredDm ||
      (dmProposal.wouldChange && Boolean(dmProposal.proposedAssignedDM)),
  };
}

export function buildP229Opportunity(input: P229ClassifyInput): P229CandidateOpportunity {
  const { snapshot, locationProposal, dmProposal, coverageProposal } = input;
  const currentBlockers = evaluateP228EligibilityBlockers(snapshot);
  const routingBlockers = extractRoutingBlockers(currentBlockers);
  const classified = classifyP229Opportunity(input);

  const simulated = applyP229SimulatedSnapshot(
    snapshot,
    locationProposal,
    dmProposal,
    coverageProposal,
  );
  const simulatedBlockers = evaluateP228EligibilityBlockers(simulated);
  const simulatedEligible = isP228SendEligible(simulated);
  const routingClearedAfterSim = extractRoutingBlockers(simulatedBlockers).length === 0;

  return {
    candidateId: snapshot.candidateId,
    redactedCandidateId: snapshot.redactedCandidateId,
    name: snapshot.name,
    email: snapshot.email,
    city: snapshot.city,
    state: snapshot.state,
    zip: snapshot.zip,
    positionId: snapshot.positionId,
    positionName: snapshot.positionName,
    workflowStatus: snapshot.workflowStatus,
    paperworkStatus: snapshot.paperworkStatus,
    assignedDM: snapshot.assignedDM,
    assignedRecruiter: snapshot.assignedRecruiter,
    listMembershipSource: snapshot.listMembershipSource,
    nearestActiveWorkMiles: snapshot.nearestActiveWorkMiles,
    coverageKnown: snapshot.coverageKnown,
    coverageTier: snapshot.coverageTier,
    currentBlockers,
    routingBlockers,
    primaryCategory: classified.primaryCategory,
    secondaryCategories: classified.secondaryCategories,
    recoveryCapability: classified.recoveryCapability,
    locationProposal,
    dmProposal,
    coverageProposal,
    simulatedBlockers,
    simulatedEligible,
    routingClearedAfterSim,
    notes: classified.notes,
  };
}

export function emptyCategoryCounts(): Record<P229Category, number> {
  return { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
}
