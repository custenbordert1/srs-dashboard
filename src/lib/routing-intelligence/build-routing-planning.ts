import type { BreezyJob } from "@/lib/breezy-api";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import type { CoverageRecommendation } from "@/lib/recruiting-decision-intelligence/types";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";
import { countRepsNearOpportunity } from "@/lib/coverage-risk-engine/rep-proximity";
import { buildStoreClusters } from "@/lib/routing-intelligence/route-cluster";
import { buildRoutePacksFromClusters } from "@/lib/routing-intelligence/route-pack-builder";
import { buildRoutingIntelligence } from "@/lib/routing-intelligence/build-routing-intelligence";
import { computeTravelBurdenIntel, type TravelBurdenIntel } from "@/lib/routing-intelligence/travel-burden";
import { scoreRoutePack } from "@/lib/routing-intelligence/route-pack-scoring";
import { buildGeoVisualization, type GeoVisualizationSnapshot } from "@/lib/routing-intelligence/geo-visualization";
import { buildRouteQueues, type RouteQueueRow } from "@/lib/routing-intelligence/route-queue";
import {
  buildTerritoryOverviewCards,
  type TerritoryOverviewCard,
} from "@/lib/routing-intelligence/territory-overview";
import type {
  EnrichedRoutePack,
  RoutePack,
  RoutingIntelligenceSnapshot,
} from "@/lib/routing-intelligence/types";

export type { EnrichedRoutePack };

export type RoutingPlanningSnapshot = RoutingIntelligenceSnapshot & {
  territoryOverview: TerritoryOverviewCard[];
  routeQueues: RouteQueueRow[];
  enrichedRoutePacks: EnrichedRoutePack[];
  geoVisualization: GeoVisualizationSnapshot;
};

function enrichPacks(packs: RoutePack[], reps: ActiveRep[]): EnrichedRoutePack[] {
  return packs.map((pack) => {
    const anchor = {
      opportunityId: pack.routePackId,
      projectName: pack.label,
      client: "",
      storeAddress: "",
      storeName: pack.label,
      city: pack.cities[0] ?? "",
      state: pack.state,
      projectType: "reset",
      priority: "high" as const,
      openStatus: true,
      territoryOwner: "",
      storeCall: "open",
      projectNo: "",
      isStaffed: false,
    };
    const proximity = countRepsNearOpportunity(reps, anchor);
    const burden = computeTravelBurdenIntel(pack, proximity.activeWithin50);
    return {
      ...pack,
      geoClusterId: pack.clusterId,
      burden,
      routePackScore: scoreRoutePack(pack, burden),
    };
  });
}

export function attachRoutingPlanning(
  base: RoutingIntelligenceSnapshot,
  input: {
    opportunities: MelOpportunity[];
    reps: ActiveRep[];
    jobs: BreezyJob[];
  },
): RoutingPlanningSnapshot {
  const clusters = buildStoreClusters(input.opportunities);
  const packs = base.routePacks.length > 0 ? base.routePacks : buildRoutePacksFromClusters(clusters, input.reps);
  const enrichedRoutePacks = enrichPacks(packs, input.reps);

  return {
    ...base,
    routePacks: packs,
    territoryOverview: buildTerritoryOverviewCards(clusters, enrichedRoutePacks),
    routeQueues: buildRouteQueues({ clusters, enrichedPacks: enrichedRoutePacks, jobs: input.jobs }),
    enrichedRoutePacks,
    geoVisualization: buildGeoVisualization(clusters, enrichedRoutePacks),
  };
}

export function buildRoutingPlanningSnapshot(input: {
  fetchedAt: string;
  opportunities: MelOpportunity[];
  reps: ActiveRep[];
  jobs: BreezyJob[];
  coverageRecommendations?: CoverageRecommendation[];
  escalations?: RecruiterEscalationQueueItem[];
}): RoutingPlanningSnapshot {
  const base = buildRoutingIntelligence(input);
  return attachRoutingPlanning(base, {
    opportunities: input.opportunities,
    reps: input.reps,
    jobs: input.jobs,
  });
}
