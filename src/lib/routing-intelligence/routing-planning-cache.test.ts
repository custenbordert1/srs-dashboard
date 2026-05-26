import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { buildCachedRoutingPlanningSnapshot } from "@/lib/routing-intelligence/build-routing-planning-cached";
import { clearRoutingIntelligenceCaches } from "@/lib/routing-intelligence/routing-intelligence-cache";

function opportunity(city: string, state: string, id: string): MelOpportunity {
  return {
    opportunityId: id,
    projectName: `Project ${id}`,
    client: "Walmart",
    storeAddress: "123 Main",
    storeName: `Store ${id}`,
    city,
    state,
    projectType: "reset",
    priority: "high",
    openStatus: true,
    territoryOwner: "TX DM",
    storeCall: "open",
    projectNo: id,
    isStaffed: false,
  };
}

function rep(): ActiveRep {
  return {
    repId: "rep-1",
    name: "Alex Rep",
    city: "Dallas",
    state: "TX",
    zip: "75201",
    lat: 32.78,
    lng: -96.8,
    active: true,
    skills: ["reset"],
    travelRadius: 50,
    lastProjectDate: null,
    completionRate: 0.9,
    noShowRate: 0.1,
    dmOwner: "DM",
    melStatus: "active",
    trainingStatus: "certified",
    openAssignments: 1,
    completedAssignments: 10,
  };
}

function job(city: string): BreezyJob {
  return {
    jobId: `job-${city}`,
    name: "Merchandiser",
    city,
    state: "TX",
    zip: "75001",
    displayLocation: `${city}, TX`,
    locationSource: "location_city_state",
    status: "published",
    createdDate: "2026-04-01T00:00:00.000Z",
    updatedDate: "2026-05-01T00:00:00.000Z",
  };
}

describe("cached routing planning", () => {
  it("returns cache hit on second build with same key", () => {
    clearRoutingIntelligenceCaches();
    const opps = [
      opportunity("Dallas", "TX", "o1"),
      opportunity("Dallas", "TX", "o2"),
      opportunity("Plano", "TX", "o3"),
    ];
    const input = {
      fetchedAt: "2026-05-20T12:00:00.000Z",
      melFetchedAt: "2026-05-20T12:00:00.000Z",
      territoryScope: "TX",
      opportunities: opps,
      reps: [rep()],
      jobs: [job("Dallas")],
    };
    const first = buildCachedRoutingPlanningSnapshot(input);
    assert.equal(first.meta.cacheHit, false);
    const second = buildCachedRoutingPlanningSnapshot(input);
    assert.equal(second.meta.cacheHit, true);
    assert.equal(second.snapshot.loadState?.phase, "detail");
    clearRoutingIntelligenceCaches();
  });
});
