import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import {
  buildCoverageOptimizationSnapshot,
  buildRepRecommendation,
  buildRoutePlan,
  estimateProjectTravelCostUsd,
  ROUTING_PROVIDER_CAPABILITIES,
  simulateCoverageChange,
} from "@/lib/coverage-optimization";

function sampleRep(overrides: Partial<ActiveRep> = {}): ActiveRep {
  return {
    repId: "rep-1",
    name: "Jordan Smith",
    city: "Dallas",
    state: "TX",
    zip: "75001",
    lat: 32.7767,
    lng: -96.797,
    active: true,
    skills: ["merchandising"],
    travelRadius: 120,
    lastProjectDate: "2026-05-10",
    completionRate: 0.92,
    noShowRate: 0.04,
    dmOwner: "Amy Harp",
    melStatus: "active",
    trainingStatus: "certified",
    openAssignments: 1,
    completedAssignments: 24,
    lastLoginDaysAgo: 2,
    ...overrides,
  };
}

function sampleOpportunity(overrides: Partial<MelOpportunity> = {}): MelOpportunity {
  return {
    opportunityId: "opp-1",
    projectName: "Walmart Reset",
    client: "Acme Retail",
    storeAddress: "100 Main St",
    storeName: "Store 42",
    city: "Fort Worth",
    state: "TX",
    projectType: "Reset",
    priority: "high",
    openStatus: true,
    territoryOwner: "Amy Harp",
    storeCall: "SC-1",
    projectNo: "P-100",
    isStaffed: false,
    ...overrides,
  };
}

describe("coverage-optimization", () => {
  it("exposes future-ready routing provider stubs", () => {
    assert.equal(ROUTING_PROVIDER_CAPABILITIES.heuristic.enabled, true);
    assert.equal(ROUTING_PROVIDER_CAPABILITIES["google-maps"].enabled, false);
    assert.equal(ROUTING_PROVIDER_CAPABILITIES.mapbox.enabled, false);
  });

  it("recommends best rep with confidence and travel cost", () => {
    const recommendation = buildRepRecommendation(
      [sampleRep(), sampleRep({ repId: "rep-2", name: "Casey Lee", city: "Houston", lat: 29.76, lng: -95.37 })],
      sampleOpportunity(),
      { territoryStates: ["TX"] },
    );

    assert.ok(recommendation.bestRep);
    assert.equal(recommendation.bestRep.repName, "Jordan Smith");
    assert.ok(recommendation.confidenceScore > 0);
    assert.ok(recommendation.fillProbability > 0);
    assert.ok(recommendation.alternatives.length <= 5);
    assert.ok((recommendation.bestRep.estimatedTravelCostUsd ?? 0) > 0);
  });

  it("builds multi-stop route plan with mileage and hotel flag", () => {
    const opportunities = [
      sampleOpportunity({ opportunityId: "opp-a", city: "Dallas", state: "TX" }),
      sampleOpportunity({ opportunityId: "opp-b", city: "Austin", state: "TX", projectName: "HEB" }),
      sampleOpportunity({ opportunityId: "opp-c", city: "Houston", state: "TX", projectName: "Kroger" }),
    ];
    const plan = buildRoutePlan(["opp-a", "opp-b", "opp-c"], opportunities);
    assert.ok(plan);
    assert.equal(plan!.stops.length, 3);
    assert.ok(plan!.totalMiles >= 0);
    assert.ok(plan!.estimatedTotalCostUsd >= plan!.mileageCostUsd);
    assert.equal(typeof plan!.overnightRecommended, "boolean");
  });

  it("simulates roster removal impact on coverage metrics", () => {
    const reps = [
      sampleRep(),
      sampleRep({ repId: "rep-2", name: "Casey Lee", city: "Houston", lat: 29.76, lng: -95.37 }),
    ];
    const opportunities = [sampleOpportunity()];
    const delta = simulateCoverageChange({
      opportunities,
      reps,
      candidates: [] as BreezyCandidate[],
      fetchedAt: "2026-05-28T12:00:00.000Z",
      removeRepIds: ["rep-1"],
    });

    assert.ok(delta.territoryCoveragePercent >= 0);
    assert.equal(typeof delta.deltaCoveragePercent, "number");
    assert.equal(typeof delta.deltaRiskScore, "number");
  });

  it("builds executive snapshot rollup", () => {
    const snapshot = buildCoverageOptimizationSnapshot({
      jobs: [] as BreezyJob[],
      candidates: [] as BreezyCandidate[],
      opportunities: [sampleOpportunity()],
      activeReps: [sampleRep()],
      coverage: null,
      fetchedAt: "2026-05-28T12:00:00.000Z",
      territoryStates: ["TX"],
    });

    assert.equal(snapshot.recommendations.length, 1);
    assert.equal(snapshot.prioritizedOpenCalls.length, 1);
    assert.ok(snapshot.executive.averageFillProbability >= 0);
    assert.ok(Array.isArray(snapshot.executive.highestCostTerritories));
  });

  it("adds hotel cost for long-haul travel", () => {
    const local = estimateProjectTravelCostUsd({ distanceMiles: 40, driveTimeMinutes: 55 });
    const longHaul = estimateProjectTravelCostUsd({ distanceMiles: 280, driveTimeMinutes: 360 });
    assert.ok(local !== null && longHaul !== null);
    assert.ok(longHaul > local);
  });
});
