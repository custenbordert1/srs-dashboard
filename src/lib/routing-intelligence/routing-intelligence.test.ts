import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { buildStoreClusters } from "@/lib/routing-intelligence/route-cluster";
import { buildRoutePacksFromClusters } from "@/lib/routing-intelligence/route-pack-builder";
import { buildRoutingIntelligence } from "@/lib/routing-intelligence/build-routing-intelligence";
import {
  travelTierFromNearestRepMiles,
  routeRiskFromTierAndBurden,
} from "@/lib/routing-intelligence/travel-tier";

function rep(overrides: Partial<ActiveRep> = {}): ActiveRep {
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
    ...overrides,
  };
}

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

describe("routing intelligence travel tiers", () => {
  it("maps nearest rep miles to tiers", () => {
    assert.equal(travelTierFromNearestRepMiles(12), 1);
    assert.equal(travelTierFromNearestRepMiles(30), 2);
    assert.equal(travelTierFromNearestRepMiles(50), 3);
    assert.equal(travelTierFromNearestRepMiles(null), 4);
    assert.equal(travelTierFromNearestRepMiles(70), 4);
  });

  it("classifies route risk from tier and burden", () => {
    assert.equal(routeRiskFromTierAndBurden(4, 80, 5), "operational_risk");
    assert.equal(routeRiskFromTierAndBurden(2, 55, 6), "staffing_pressure");
    assert.equal(routeRiskFromTierAndBurden(1, 20, 2), "healthy");
  });
});

describe("routing intelligence clusters", () => {
  it("clusters open stores by city", () => {
    const clusters = buildStoreClusters([
      opportunity("Dallas", "TX", "o1"),
      opportunity("Dallas", "TX", "o2"),
      opportunity("Plano", "TX", "o3"),
    ]);
    const dallas = clusters.find((row) => row.city === "Dallas");
    assert.ok(dallas);
    assert.equal(dallas!.storeCount, 2);
  });
});

describe("routing intelligence route packs", () => {
  it("builds multi-city route pack recommendations", () => {
    const clusters = buildStoreClusters([
      opportunity("Dallas", "TX", "o1"),
      opportunity("Dallas", "TX", "o2"),
      opportunity("Plano", "TX", "o3"),
      opportunity("Arlington", "TX", "o4"),
    ]);
    const packs = buildRoutePacksFromClusters(clusters, [rep()]);
    assert.ok(packs.length > 0);
    assert.ok(packs[0]!.groupingRecommendation.includes("stores within"));
    assert.equal(packs[0]!.manualOnly, true);
  });
});

describe("routing intelligence snapshot", () => {
  it("attaches job routing context with route pack links", () => {
    const jobs: BreezyJob[] = [
      {
        jobId: "job-1",
        name: "Merchandiser",
        city: "Dallas",
        state: "TX",
        zip: "75201",
        displayLocation: "Dallas, TX",
        locationSource: "location",
        status: "published",
        createdDate: "2026-04-01T00:00:00.000Z",
        updatedDate: "2026-05-01T00:00:00.000Z",
      },
    ];
    const snapshot = buildRoutingIntelligence({
      fetchedAt: "2026-05-20T12:00:00.000Z",
      opportunities: [
        opportunity("Dallas", "TX", "o1"),
        opportunity("Dallas", "TX", "o2"),
        opportunity("Plano", "TX", "o3"),
      ],
      reps: [rep()],
      jobs,
      coverageRecommendations: [
        {
          jobId: "job-1",
          jobTitle: "Merchandiser",
          city: "Dallas",
          state: "TX",
          nearbyActiveReps25Mi: 1,
          pendingVariantsNearby: 0,
          approvedUnpublishedVariantsNearby: 0,
          publishedVariantsNearby: 0,
          strongerApplicantFlowCities: [],
          territorySaturationScore: 2,
          openOpportunityCount: 3,
          staffingRiskScore: 120,
          recommendedExpansionCities: ["Dallas", "Plano", "Arlington"],
          recommendedExpansionRadiusMiles: 25,
          daysWithoutHire: 20,
          jobAgeDays: 30,
          summaryBullets: ["Expand metro"],
        },
      ],
    });

    const ctx = snapshot.jobContexts["job-1"];
    assert.ok(ctx);
    assert.ok(ctx.travelTier <= 3 || ctx.nearbyOpenStores >= 2);
    assert.equal(ctx.manualOnly, true);
    assert.equal(snapshot.manualOnly, true);
    assert.ok(snapshot.routeRiskQueue.length >= 0);
    assert.ok(ctx.routeGroupingRecommendations.length > 0);
  });
});
