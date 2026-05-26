import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { attachRoutingPlanning, buildRoutingPlanningSnapshot } from "@/lib/routing-intelligence/build-routing-planning";
import { buildStoreClusters } from "@/lib/routing-intelligence/route-cluster";
import { buildRoutePacksFromClusters } from "@/lib/routing-intelligence/route-pack-builder";
import { computeTravelBurdenIntel } from "@/lib/routing-intelligence/travel-burden";
import { scoreRoutePack } from "@/lib/routing-intelligence/route-pack-scoring";
import { buildRouteQueues } from "@/lib/routing-intelligence/route-queue";
import { buildTerritoryOverviewCards } from "@/lib/routing-intelligence/territory-overview";
import {
  filterRouteQueue,
  sortRouteQueue,
} from "@/lib/routing-intelligence/recruiter-routing-filters";
import {
  travelTierFromNearestRepMiles,
  routeRiskFromTierAndBurden,
} from "@/lib/routing-intelligence/travel-tier";
import { buildRoutingIntelligence } from "@/lib/routing-intelligence/build-routing-intelligence";

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

  it("scores route packs with travel burden", () => {
    const clusters = buildStoreClusters([
      opportunity("Dallas", "TX", "o1"),
      opportunity("Dallas", "TX", "o2"),
      opportunity("Plano", "TX", "o3"),
    ]);
    const pack = buildRoutePacksFromClusters(clusters, [rep()])[0]!;
    const burden = computeTravelBurdenIntel(pack);
    const score = scoreRoutePack(pack, burden);
    assert.ok(burden.routeEfficiencyScore >= 0);
    assert.ok(burden.estimatedOvernightLikelihood >= 0);
    assert.ok(score > 0);
  });
});

describe("routing intelligence planning snapshot", () => {
  it("builds territory overview and route queues", () => {
    const opps = [
      opportunity("Dallas", "TX", "o1"),
      opportunity("Dallas", "TX", "o2"),
      opportunity("Plano", "TX", "o3"),
    ];
    const clusters = buildStoreClusters(opps);
    const packs = buildRoutePacksFromClusters(clusters, [rep()]);
    const enriched = packs.map((pack) => ({
      ...pack,
      geoClusterId: pack.clusterId,
      burden: computeTravelBurdenIntel(pack),
      routePackScore: scoreRoutePack(pack, computeTravelBurdenIntel(pack)),
      groupedStores: [],
      nearbyReps: [],
    }));
    const overview = buildTerritoryOverviewCards(clusters, enriched);
    assert.equal(overview.length, 6);
    const queues = buildRouteQueues({ clusters, enrichedPacks: enriched, jobs: [] });
    assert.ok(queues.length > 0);
    assert.equal(queues.every((row) => row.manualOnly === true), true);
  });

  it("filters and sorts route queue rows", () => {
    const rows = buildRouteQueues({
      clusters: buildStoreClusters([
        opportunity("Dallas", "TX", "o1"),
        opportunity("Dallas", "TX", "o2"),
      ]),
      enrichedPacks: buildRoutePacksFromClusters(
        buildStoreClusters([opportunity("Dallas", "TX", "o1"), opportunity("Dallas", "TX", "o2")]),
        [rep()],
      ).map((pack) => ({
        ...pack,
        geoClusterId: pack.clusterId,
        burden: computeTravelBurdenIntel(pack),
        routePackScore: 10,
      })),
      jobs: [],
    });
    const overnight = filterRouteQueue(rows, "overnight");
    const sorted = sortRouteQueue(rows, "miles");
    assert.ok(sorted.length >= overnight.length);
  });

  it("attaches planning layer to routing snapshot", () => {
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
    const snapshot = buildRoutingPlanningSnapshot({
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
    assert.ok(snapshot.territoryOverview && snapshot.territoryOverview.length === 6);
    assert.ok(snapshot.routeQueues && snapshot.routeQueues.length > 0);
    assert.ok(snapshot.geoVisualization && snapshot.geoVisualization.nodes.length > 0);
    const opps = [
      opportunity("Dallas", "TX", "o1"),
      opportunity("Dallas", "TX", "o2"),
      opportunity("Plano", "TX", "o3"),
    ];
    const base = buildRoutingIntelligence({
      fetchedAt: "2026-05-20T12:00:00.000Z",
      opportunities: opps,
      reps: [rep()],
      jobs,
    });
    const attached = attachRoutingPlanning(base, {
      opportunities: opps,
      reps: [rep()],
      jobs,
    });
    assert.ok(attached.enrichedRoutePacks.length > 0);
    assert.ok(attached.visualWorkspace);
    assert.equal(attached.visualWorkspace.storytelling.length, 6);
    assert.ok(attached.routeQueues.every((row) => typeof row.driveBurden === "number"));
  });
});
