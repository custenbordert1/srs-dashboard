import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import { attachRoutingPlanning } from "@/lib/routing-intelligence/build-routing-planning";
import { buildRoutingIntelligence } from "@/lib/routing-intelligence/build-routing-intelligence";
import {
  buildRouteCanvasCards,
  buildRouteWorkspaceMetrics,
  buildRoutingVisualWorkspace,
  buildTerritoryStorytelling,
} from "@/lib/routing-intelligence/routing-workspace";
import { emptyRoutingVisualFoundation } from "@/lib/routing-intelligence/routing-visual-foundation";
import { sortRouteQueue } from "@/lib/routing-intelligence/recruiter-routing-filters";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";

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

describe("routing visual workspace", () => {
  it("builds canvas cards with travel tiers and workspace metrics", () => {
    const opps = [
      opportunity("Dallas", "TX", "o1"),
      opportunity("Dallas", "TX", "o2"),
      opportunity("Plano", "TX", "o3"),
    ];
    const jobs = [job("Dallas"), job("Plano")];
    const base = buildRoutingIntelligence({
      fetchedAt: "2026-05-20T12:00:00.000Z",
      opportunities: opps,
      reps: [rep()],
      jobs,
    });
    const planning = attachRoutingPlanning(base, { opportunities: opps, reps: [rep()], jobs });

    assert.ok(planning.visualWorkspace);
    assert.ok(planning.visualWorkspace.canvasCards.length > 0);
    assert.ok(planning.visualWorkspace.metrics.routePackCount > 0);
    assert.equal(planning.visualWorkspace.storytelling.length, 6);
    assert.equal(planning.visualWorkspace.visualFoundation.mapRender.enabled, false);

    const cards = buildRouteCanvasCards(
      planning.enrichedRoutePacks,
      planning.geoVisualization,
    );
    assert.ok(cards.every((card) => card.travelTier >= 1 && card.travelTier <= 4));

    const metrics = buildRouteWorkspaceMetrics(planning.enrichedRoutePacks, jobs);
    assert.ok(metrics.totalEstimatedRouteMiles > 0);
    assert.ok(metrics.avgDriveBurden >= 0);
  });

  it("sorts queue rows by drive burden and saturation", () => {
    const opps = [
      opportunity("Dallas", "TX", "o1"),
      opportunity("Dallas", "TX", "o2"),
      opportunity("Plano", "TX", "o3"),
    ];
    const planning = attachRoutingPlanning(
      buildRoutingIntelligence({
        fetchedAt: "2026-05-20T12:00:00.000Z",
        opportunities: opps,
        reps: [rep()],
        jobs: [],
      }),
      { opportunities: opps, reps: [rep()], jobs: [] },
    );

    const byBurden = sortRouteQueue(planning.routeQueues, "driveBurden");
    assert.ok(byBurden[0]!.driveBurden >= byBurden[byBurden.length - 1]!.driveBurden);

    const stories = buildTerritoryStorytelling(
      planning.enrichedRoutePacks,
      planning.routeQueues,
    );
    assert.equal(stories.length, 6);
    assert.ok(stories.some((story) => story.id === "highest-risk"));
  });

  it("exposes empty visual foundation placeholders", () => {
    const foundation = emptyRoutingVisualFoundation();
    assert.equal(foundation.routeLines.length, 0);
    assert.equal(foundation.repAssignmentEngine.length, 0);
    assert.match(foundation.mapRender.note, /future phase/i);
  });

  it("builds drawer context keyed by route pack", () => {
    const opps = [
      opportunity("Dallas", "TX", "o1"),
      opportunity("Dallas", "TX", "o2"),
    ];
    const jobs = [job("Dallas")];
    const planning = attachRoutingPlanning(
      buildRoutingIntelligence({
        fetchedAt: "2026-05-20T12:00:00.000Z",
        opportunities: opps,
        reps: [rep()],
        jobs,
      }),
      { opportunities: opps, reps: [rep()], jobs },
    );

    const workspace = buildRoutingVisualWorkspace({
      enrichedRoutePacks: planning.enrichedRoutePacks,
      routeQueues: planning.routeQueues,
      geoVisualization: planning.geoVisualization,
      jobs,
      jobContexts: planning.jobContexts,
    });

    const packId = planning.enrichedRoutePacks[0]!.routePackId;
    assert.ok(workspace.drawerContextByPackId[packId]);
  });
});
