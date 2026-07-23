import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { P228CandidateSnapshot } from "@/lib/p228-production-readiness/types";
import {
  P229_EXECUTION_MODE,
  P229_PHASE,
  applyP229SimulatedSnapshot,
  buildP229Opportunity,
  classifyP229Opportunity,
  computeP229RoutingScore,
  emptyCategoryCounts,
  extractRoutingBlockers,
  pickPrimaryCategory,
  proposeP229Coverage,
  proposeP229Dm,
  proposeP229Location,
  simulateP229Eligibility,
  analyzeP229Markets,
  estimateP229OperationalImpact,
} from "@/lib/p229-routing-recovery-analysis";

function snap(overrides: Partial<P228CandidateSnapshot> = {}): P228CandidateSnapshot {
  return {
    candidateId: "cand-1",
    redactedCandidateId: "aaaaaaaaaaaa",
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "5551234567",
    city: "Austin",
    state: "TX",
    zip: "78701",
    positionId: "pos-1",
    positionName: "Retail Merchandiser",
    workflowStatus: "Paperwork Needed",
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    assignedDM: "Amy Harp",
    assignedRecruiter: "Recruiting Team",
    listMembershipSource: "ingestion",
    nearestActiveWorkMiles: 5,
    coverageKnown: true,
    coverageTier: "tier1_0_20",
    isDuplicate: false,
    recoveredIdentity: false,
    recoveredEmail: false,
    recoveredDm: false,
    inRecoveryStore: false,
    ...overrides,
  };
}

function emptyLocProposal(city = "", state = "") {
  return proposeP229Location({
    currentCity: city,
    currentState: state,
    currentZip: "",
    evidence: { cities: [], states: [], zips: [], sources: [] },
  });
}

describe("P229 constants", () => {
  it("is read-only preview phase", () => {
    assert.equal(P229_PHASE, "P229");
    assert.equal(P229_EXECUTION_MODE, "read_only");
  });
});

describe("P229 routing blocker extraction", () => {
  it("extracts only routing blockers", () => {
    const blockers = extractRoutingBlockers([
      "missing_location",
      "missing_email",
      "coverage_unknown",
      "missing_assigned_dm",
      "missing_recruiter",
    ]);
    assert.deepEqual(blockers, [
      "coverage_unknown",
      "missing_assigned_dm",
      "missing_location",
    ]);
  });
});

describe("P229 location proposal integrity", () => {
  it("does not invent location when evidence empty", () => {
    const p = proposeP229Location({
      currentCity: "",
      currentState: "",
      currentZip: "",
      evidence: { cities: [], states: [], zips: [], sources: [] },
    });
    assert.equal(p.wouldChange, false);
    assert.equal(p.proposedCity, null);
    assert.equal(p.ambiguous, false);
  });

  it("recovers single authoritative city/state", () => {
    const p = proposeP229Location({
      currentCity: "",
      currentState: "",
      currentZip: "",
      evidence: {
        cities: ["Columbus"],
        states: ["OH"],
        zips: ["43215"],
        sources: ["p218_position_location"],
      },
    });
    assert.equal(p.wouldChange, true);
    assert.equal(p.proposedCity, "Columbus");
    assert.equal(p.proposedState, "OH");
    assert.match(String(p.authoritativeSource), /p218|position/i);
  });

  it("rejects conflicting cities (no fabrication)", () => {
    const p = proposeP229Location({
      currentCity: "",
      currentState: "",
      currentZip: "",
      evidence: {
        cities: ["Austin", "Dallas"],
        states: ["TX"],
        zips: [],
        sources: ["a", "b"],
      },
    });
    assert.equal(p.wouldChange, false);
    assert.equal(p.ambiguous, true);
    assert.ok(p.conflictingValues.length >= 2);
  });
});

describe("P229 DM proposal (P216 territory)", () => {
  it("proposes DM for Unassigned when home state mapped", () => {
    const p = proposeP229Dm({
      currentAssignedDM: "Unassigned",
      city: "",
      state: "",
      positionId: null,
      positionName: null,
      positionStatus: null,
      locationSource: "missing",
      postingAuthoritative: false,
      homeCity: "Columbus",
      homeState: "OH",
    });
    assert.equal(p.wouldChange, true);
    assert.equal(p.proposedAssignedDM, "Mindie Rodriguez");
    assert.equal(p.authoritativeSource, "p216_position_location_territory_routing");
  });

  it("flags ambiguous when existing DM conflicts with routing", () => {
    const p = proposeP229Dm({
      currentAssignedDM: "Amy Harp",
      city: "Columbus",
      state: "OH",
      positionId: "p1",
      positionName: "Job",
      positionStatus: "published",
      locationSource: "location.city+location.state",
      postingAuthoritative: true,
      homeCity: "Columbus",
      homeState: "OH",
    });
    assert.equal(p.ambiguous, true);
    assert.equal(p.wouldChange, false);
  });
});

describe("P229 coverage proposal", () => {
  it("applies cache hit miles only when geocode validated", () => {
    const p = proposeP229Coverage({
      currentKnown: false,
      currentMiles: null,
      currentTier: "unknown",
      geocodeCacheHit: true,
      computedMiles: 12.4,
      locationAvailable: true,
    });
    assert.equal(p.proposedKnown, true);
    assert.equal(p.proposedMiles, 12.4);
    assert.equal(p.needsGeocodeRefresh, false);
  });

  it("marks geocode refresh when location exists but no cache", () => {
    const p = proposeP229Coverage({
      currentKnown: false,
      currentMiles: null,
      currentTier: "unknown",
      geocodeCacheHit: false,
      computedMiles: null,
      locationAvailable: true,
    });
    assert.equal(p.needsGeocodeRefresh, true);
    assert.equal(p.proposedKnown, false);
  });
});

describe("P229 classification A–F", () => {
  it("picks most-blocking category as primary", () => {
    assert.equal(pickPrimaryCategory(["A", "D", "C"]), "C");
    assert.equal(pickPrimaryCategory(["A", "B"]), "B");
    assert.equal(pickPrimaryCategory(["F", "E"]), "F");
  });

  it("classifies missing DM with known location as D", () => {
    const snapshot = snap({
      assignedDM: "Unassigned",
      coverageKnown: true,
      nearestActiveWorkMiles: 8,
      coverageTier: "tier1_0_20",
    });
    const locationProposal = emptyLocProposal("Austin", "TX");
    const dmProposal = proposeP229Dm({
      currentAssignedDM: "Unassigned",
      city: "",
      state: "",
      positionId: "pos-1",
      positionName: "Job",
      positionStatus: null,
      locationSource: "missing",
      postingAuthoritative: false,
      homeCity: "Austin",
      homeState: "TX",
    });
    const coverageProposal = proposeP229Coverage({
      currentKnown: true,
      currentMiles: 8,
      currentTier: "tier1_0_20",
      geocodeCacheHit: true,
      computedMiles: 8,
      locationAvailable: true,
    });
    const result = classifyP229Opportunity({
      snapshot,
      locationProposal,
      dmProposal,
      coverageProposal,
      positionLocationNeedsRepair: false,
      positionLocationAuthoritative: false,
    });
    assert.equal(result.primaryCategory, "D");
    assert.equal(result.recoveryCapability, "authoritative_data");
  });

  it("classifies coverage cache miss as B", () => {
    const snapshot = snap({
      coverageKnown: false,
      nearestActiveWorkMiles: null,
      coverageTier: "unknown",
      assignedDM: "Amy Harp",
    });
    const result = classifyP229Opportunity({
      snapshot,
      locationProposal: emptyLocProposal("Austin", "TX"),
      dmProposal: {
        currentAssignedDM: "Amy Harp",
        proposedAssignedDM: null,
        expectedDmFromRouting: "Amy Harp",
        routingState: "TX",
        wouldChange: false,
        authoritativeSource: null,
        ambiguous: false,
      },
      coverageProposal: proposeP229Coverage({
        currentKnown: false,
        currentMiles: null,
        currentTier: "unknown",
        geocodeCacheHit: false,
        computedMiles: null,
        locationAvailable: true,
      }),
      positionLocationNeedsRepair: false,
      positionLocationAuthoritative: true,
    });
    assert.equal(result.primaryCategory, "B");
  });

  it("classifies Position.Location repair as C when location missing", () => {
    const snapshot = snap({
      city: "",
      state: "",
      coverageKnown: false,
      nearestActiveWorkMiles: null,
      coverageTier: "unknown",
      assignedDM: "Unassigned",
    });
    const result = classifyP229Opportunity({
      snapshot,
      locationProposal: emptyLocProposal("", ""),
      dmProposal: {
        currentAssignedDM: "Unassigned",
        proposedAssignedDM: null,
        expectedDmFromRouting: null,
        routingState: null,
        wouldChange: false,
        authoritativeSource: null,
        ambiguous: false,
      },
      coverageProposal: proposeP229Coverage({
        currentKnown: false,
        currentMiles: null,
        currentTier: "unknown",
        geocodeCacheHit: false,
        computedMiles: null,
        locationAvailable: false,
      }),
      positionLocationNeedsRepair: true,
      positionLocationAuthoritative: false,
    });
    assert.equal(result.primaryCategory, "C");
  });
});

describe("P229 eligibility simulation", () => {
  it("increases eligibility when DM + coverage recovered for Paperwork Needed", () => {
    const blocked = snap({
      assignedDM: "Unassigned",
      coverageKnown: false,
      nearestActiveWorkMiles: null,
      coverageTier: "unknown",
    });
    const locationProposal = emptyLocProposal("Austin", "TX");
    const dmProposal = proposeP229Dm({
      currentAssignedDM: "Unassigned",
      city: "",
      state: "",
      positionId: "pos-1",
      positionName: "Job",
      positionStatus: null,
      locationSource: "missing",
      postingAuthoritative: false,
      homeCity: "Austin",
      homeState: "TX",
    });
    const coverageProposal = proposeP229Coverage({
      currentKnown: false,
      currentMiles: null,
      currentTier: "unknown",
      geocodeCacheHit: true,
      computedMiles: 6,
      locationAvailable: true,
    });
    const opp = buildP229Opportunity({
      snapshot: blocked,
      locationProposal,
      dmProposal,
      coverageProposal,
      positionLocationNeedsRepair: false,
      positionLocationAuthoritative: false,
    });
    assert.equal(opp.simulatedEligible, true);

    const sim = simulateP229Eligibility({
      allSnapshots: [blocked],
      opportunities: [opp],
    });
    assert.equal(sim.eligibility.currentEligible, 0);
    assert.equal(sim.eligibility.projectedEligible, 1);
    assert.equal(sim.eligibility.increase, 1);
  });

  it("does not mutate original snapshot object", () => {
    const original = snap({ assignedDM: "Unassigned" });
    const before = structuredClone(original);
    const locationProposal = emptyLocProposal("Austin", "TX");
    const dmProposal = proposeP229Dm({
      currentAssignedDM: "Unassigned",
      city: "",
      state: "",
      positionId: null,
      positionName: null,
      positionStatus: null,
      locationSource: "missing",
      postingAuthoritative: false,
      homeCity: "Austin",
      homeState: "TX",
    });
    const coverageProposal = proposeP229Coverage({
      currentKnown: true,
      currentMiles: 5,
      currentTier: "tier1_0_20",
      geocodeCacheHit: true,
      computedMiles: 5,
      locationAvailable: true,
    });
    const simulated = applyP229SimulatedSnapshot(
      original,
      locationProposal,
      dmProposal,
      coverageProposal,
    );
    assert.notEqual(simulated.assignedDM, original.assignedDM);
    assert.deepEqual(original, before);
  });

  it("reports batch feasibility for 5/10/20/50", () => {
    const ready = snap();
    const sim = simulateP229Eligibility({ allSnapshots: [ready], opportunities: [] });
    assert.equal(sim.eligibility.batchFeasibility.length, 4);
    assert.deepEqual(
      sim.eligibility.batchFeasibility.map((b) => b.batchSize),
      [5, 10, 20, 50],
    );
  });
});

describe("P229 candidate integrity / duplicate audit hooks", () => {
  it("preserves duplicate flag through simulation", () => {
    const dup = snap({
      isDuplicate: true,
      assignedDM: "Unassigned",
      email: "shared@example.com",
    });
    const locationProposal = emptyLocProposal("Austin", "TX");
    const dmProposal = proposeP229Dm({
      currentAssignedDM: "Unassigned",
      city: "",
      state: "",
      positionId: null,
      positionName: null,
      positionStatus: null,
      locationSource: "missing",
      postingAuthoritative: false,
      homeCity: "Austin",
      homeState: "TX",
    });
    const coverageProposal = proposeP229Coverage({
      currentKnown: true,
      currentMiles: 5,
      currentTier: "tier1_0_20",
      geocodeCacheHit: true,
      computedMiles: 5,
      locationAvailable: true,
    });
    const simulated = applyP229SimulatedSnapshot(
      dup,
      locationProposal,
      dmProposal,
      coverageProposal,
    );
    assert.equal(simulated.isDuplicate, true);
    assert.equal(simulated.email, "shared@example.com");
    assert.equal(simulated.candidateId, dup.candidateId);
  });

  it("does not invent email/name/phone during routing recovery", () => {
    const thin = snap({
      name: "",
      email: "",
      phone: "",
      assignedDM: "Unassigned",
    });
    const simulated = applyP229SimulatedSnapshot(
      thin,
      emptyLocProposal("Austin", "TX"),
      proposeP229Dm({
        currentAssignedDM: "Unassigned",
        city: "",
        state: "",
        positionId: null,
        positionName: null,
        positionStatus: null,
        locationSource: "missing",
        postingAuthoritative: false,
        homeCity: "Austin",
        homeState: "TX",
      }),
      proposeP229Coverage({
        currentKnown: true,
        currentMiles: 5,
        currentTier: "tier1_0_20",
        geocodeCacheHit: true,
        computedMiles: 5,
        locationAvailable: true,
      }),
    );
    assert.equal(simulated.name, "");
    assert.equal(simulated.email, "");
    assert.equal(simulated.phone, "");
  });
});

describe("P229 markets and operational impact", () => {
  it("aggregates recoverable markets and estimates capacity", () => {
    const snapshot = snap({ assignedDM: "Unassigned" });
    const opp = buildP229Opportunity({
      snapshot,
      locationProposal: emptyLocProposal("Austin", "TX"),
      dmProposal: proposeP229Dm({
        currentAssignedDM: "Unassigned",
        city: "",
        state: "",
        positionId: null,
        positionName: null,
        positionStatus: null,
        locationSource: "missing",
        postingAuthoritative: false,
        homeCity: "Austin",
        homeState: "TX",
      }),
      coverageProposal: proposeP229Coverage({
        currentKnown: true,
        currentMiles: 5,
        currentTier: "tier1_0_20",
        geocodeCacheHit: true,
        computedMiles: 5,
        locationAvailable: true,
      }),
      positionLocationNeedsRepair: false,
      positionLocationAuthoritative: false,
    });
    const markets = analyzeP229Markets([opp]);
    assert.ok(markets.topRecoverableStates.some((s) => s.state === "TX"));
    const counts = emptyCategoryCounts();
    counts[opp.primaryCategory] = 1;
    const impact = estimateP229OperationalImpact({
      categoryCounts: counts,
      eligibilityIncrease: 1,
      routingClearedIncrease: 1,
      potentialSendReadyIfPaperworkNeeded: 1,
      opportunities: [opp],
    });
    assert.ok(impact.additionalPaperworkCandidates >= 1);
    assert.match(impact.expectedRecruiterWorkloadDelta, /out of scope/i);
  });
});

describe("P229 routing score", () => {
  it("improves when coverage and DM recover on active population", () => {
    const before = [
      snap({
        candidateId: "a",
        assignedDM: "Unassigned",
        coverageKnown: false,
        nearestActiveWorkMiles: null,
        coverageTier: "unknown",
        workflowStatus: "Paperwork Sent",
        paperworkStatus: "sent",
        signatureRequestId: "sig",
      }),
    ];
    const after = [
      snap({
        candidateId: "a",
        assignedDM: "Amy Harp",
        coverageKnown: true,
        nearestActiveWorkMiles: 10,
        coverageTier: "tier1_0_20",
        workflowStatus: "Paperwork Sent",
        paperworkStatus: "sent",
        signatureRequestId: "sig",
      }),
    ];
    const cur = computeP229RoutingScore(before);
    const proj = computeP229RoutingScore(after);
    assert.ok(proj.score >= cur.score);
  });
});

describe("P229 zero-write audit shape", () => {
  it("documents that simulation never mutates input records", () => {
    const input = snap({ assignedDM: "Unassigned" });
    const clone = structuredClone(input);
    buildP229Opportunity({
      snapshot: input,
      locationProposal: emptyLocProposal("Austin", "TX"),
      dmProposal: proposeP229Dm({
        currentAssignedDM: "Unassigned",
        city: "",
        state: "",
        positionId: null,
        positionName: null,
        positionStatus: null,
        locationSource: "missing",
        postingAuthoritative: false,
        homeCity: "Austin",
        homeState: "TX",
      }),
      coverageProposal: proposeP229Coverage({
        currentKnown: true,
        currentMiles: 5,
        currentTier: "tier1_0_20",
        geocodeCacheHit: true,
        computedMiles: 5,
        locationAvailable: true,
      }),
      positionLocationNeedsRepair: false,
      positionLocationAuthoritative: false,
    });
    assert.deepEqual(input, clone);
  });
});
