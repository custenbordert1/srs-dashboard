import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { BreezyJob } from "@/lib/breezy-api";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";
import { countRepsNearOpportunity } from "@/lib/coverage-risk-engine/rep-proximity";
import { buildStoreClusters } from "@/lib/routing-intelligence/route-cluster";
import { buildRoutePacksFromClusters } from "@/lib/routing-intelligence/route-pack-builder";
import {
  buildRoutingIntelligence,
  type RoutingSharedGeometry,
} from "@/lib/routing-intelligence/build-routing-intelligence";
import { computeTravelBurdenIntel } from "@/lib/routing-intelligence/travel-burden";
import { scoreRoutePack } from "@/lib/routing-intelligence/route-pack-scoring";
import { buildGeoVisualization } from "@/lib/routing-intelligence/geo-visualization";
import { buildRouteQueues } from "@/lib/routing-intelligence/route-queue";
import { buildTerritoryOverviewCards } from "@/lib/routing-intelligence/territory-overview";
import { milesBetweenRepAndProject } from "@/lib/rep-intelligence/distance-engine";
import type { RoutingPlanningSnapshot } from "@/lib/routing-intelligence/build-routing-planning";
import { emptyRoutingIntelligence } from "@/lib/routing-intelligence/build-routing-intelligence";
import { attachRoutingPlanning } from "@/lib/routing-intelligence/build-routing-planning";
import {
  buildRoutingCacheKey,
  estimatePayloadBytes,
  getCachedGeoClusters,
  getCachedGeoVisualization,
  getCachedRoutePacks,
  getCachedRoutingPlanning,
  getCachedRouteWorkspace,
  getCachedTravelMetrics,
  setCachedGeoClusters,
  setCachedGeoVisualization,
  setCachedRoutePacks,
  setCachedRoutingPlanning,
  setCachedRouteWorkspace,
  setCachedTravelMetrics,
  type RoutingCacheKeyInput,
} from "@/lib/routing-intelligence/routing-intelligence-cache";
import { logRoutingIntelligence } from "@/lib/routing-intelligence/routing-intelligence-log";
import { buildRoutingVisualWorkspace } from "@/lib/routing-intelligence/routing-workspace";
import type {
  EnrichedRoutePack,
  NearbyRepRoutingRow,
  RoutePack,
  RoutingStoreRef,
  StoreCluster,
} from "@/lib/routing-intelligence/types";

const MAX_PACK_DETAIL = 32;

export type RoutingBuildMeta = {
  cacheHit: boolean;
  totalMs: number;
  clusteringMs: number;
  routePackMs: number;
  workspaceMs: number;
  payloadBytes: number;
};

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function storesForPack(pack: RoutePack, clusters: StoreCluster[]): RoutingStoreRef[] {
  const citySet = new Set(pack.cities.map((city) => city.toLowerCase()));
  return clusters
    .filter(
      (cluster) =>
        cluster.state === pack.state && citySet.has(cluster.city.toLowerCase()),
    )
    .flatMap((cluster) => cluster.stores);
}

function repsByState(reps: ActiveRep[]): Map<string, ActiveRep[]> {
  const map = new Map<string, ActiveRep[]>();
  for (const rep of reps) {
    const state = normalizeStateCode(rep.state);
    const list = map.get(state) ?? [];
    list.push(rep);
    map.set(state, list);
  }
  return map;
}

function nearbyRepsForPack(
  pack: RoutePack,
  stateReps: ActiveRep[],
): NearbyRepRoutingRow[] {
  const anchorCity = pack.cities[0] ?? "";
  const project = { city: anchorCity, state: pack.state };
  const rows: NearbyRepRoutingRow[] = [];
  for (const rep of stateReps) {
    rows.push({
      repId: rep.repId,
      repName: rep.name,
      distanceMiles: milesBetweenRepAndProject(rep, project),
      active: rep.active,
      travelRadiusMiles: rep.travelRadius,
    });
  }
  return rows
    .filter((row) => row.distanceMiles !== null)
    .sort((a, b) => (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999))
    .slice(0, 6);
}

function enrichPackOperational(pack: RoutePack, stateReps: ActiveRep[]): EnrichedRoutePack {
  const packKey = `${pack.routePackId}:${stateReps.length}`;
  const cachedBurden = getCachedTravelMetrics(packKey);
  const anchor = {
    opportunityId: pack.routePackId,
    projectName: pack.label,
    client: "",
    storeAddress: "",
    storeName: pack.label,
    city: pack.cities[0] ?? "",
    state: pack.state,
    projectType: "reset" as const,
    priority: "high" as const,
    openStatus: true,
    territoryOwner: "",
    storeCall: "open",
    projectNo: "",
    isStaffed: false,
  };
  const proximity = countRepsNearOpportunity(stateReps, anchor);
  const burden = cachedBurden ?? computeTravelBurdenIntel(pack, proximity.activeWithin50);
  if (!cachedBurden) setCachedTravelMetrics(packKey, burden);

  return {
    ...pack,
    geoClusterId: pack.clusterId,
    burden,
    routePackScore: scoreRoutePack(pack, burden),
    groupedStores: [],
    nearbyReps: [],
  };
}

function attachPackDetail(
  pack: EnrichedRoutePack,
  clusters: StoreCluster[],
  stateReps: ActiveRep[],
): EnrichedRoutePack {
  return {
    ...pack,
    groupedStores: storesForPack(pack, clusters),
    nearbyReps: nearbyRepsForPack(pack, stateReps),
  };
}

export function buildCachedRoutingPlanningSnapshot(input: {
  fetchedAt: string;
  opportunities: MelOpportunity[];
  reps: ActiveRep[];
  jobs: BreezyJob[];
  territoryScope: string;
  coverageRecommendations?: import("@/lib/recruiting-decision-intelligence/types").CoverageRecommendation[];
  escalations?: RecruiterEscalationQueueItem[];
  variantTitlesByMetro?: Record<string, string[]>;
  melFetchedAt: string;
}): { snapshot: RoutingPlanningSnapshot; meta: RoutingBuildMeta } {
  const cacheKeyInput: RoutingCacheKeyInput = {
    melFetchedAt: input.melFetchedAt,
    territoryScope: input.territoryScope,
    activeRepCount: input.reps.filter((rep) => rep.active).length,
    openJobCount: input.jobs.length,
    opportunityCount: input.opportunities.length,
  };
  const cacheKey = buildRoutingCacheKey(cacheKeyInput);

  logRoutingIntelligence("build-start", {
    territory: input.territoryScope,
    opportunities: input.opportunities.length,
    jobs: input.jobs.length,
  });

  const cachedFull = getCachedRoutingPlanning(cacheKey);
  if (cachedFull) {
    const payloadBytes = estimatePayloadBytes(cachedFull);
    logRoutingIntelligence("payload-size", { bytes: payloadBytes, cacheHit: true });
    return {
      snapshot: {
        ...cachedFull,
        loadState: {
          phase: "detail",
          cacheHit: true,
          syncing: false,
          buildMs: 0,
        },
      },
      meta: {
        cacheHit: true,
        totalMs: 0,
        clusteringMs: 0,
        routePackMs: 0,
        workspaceMs: 0,
        payloadBytes,
      },
    };
  }

  logRoutingIntelligence("cache-miss", { key: cacheKey.slice(0, 48) });

  const buildStart = nowMs();
  let clusteringMs = 0;
  let routePackMs = 0;
  let workspaceMs = 0;

  const clusterStart = nowMs();
  let clusters = getCachedGeoClusters(cacheKey);
  if (!clusters) {
    clusters = buildStoreClusters(input.opportunities);
    setCachedGeoClusters(cacheKey, clusters);
  }
  clusteringMs = Math.round(nowMs() - clusterStart);
  logRoutingIntelligence("clustering", { ms: clusteringMs, clusters: clusters.length });

  const packStart = nowMs();
  let routePacks = getCachedRoutePacks(cacheKey);
  if (!routePacks) {
    routePacks = buildRoutePacksFromClusters(clusters, input.reps);
    setCachedRoutePacks(cacheKey, routePacks);
  }
  routePackMs = Math.round(nowMs() - packStart);
  logRoutingIntelligence("route-pack-generation", { ms: routePackMs, packs: routePacks.length });

  const shared: RoutingSharedGeometry = { clusters, routePacks };
  const base = buildRoutingIntelligence(
    {
      fetchedAt: input.fetchedAt,
      opportunities: input.opportunities,
      reps: input.reps,
      jobs: input.jobs,
      coverageRecommendations: input.coverageRecommendations,
      escalations: input.escalations,
    },
    shared,
  );

  const stateRepIndex = repsByState(input.reps);
  const enrichedOperational: EnrichedRoutePack[] = routePacks.map((pack) => {
    const stateReps = stateRepIndex.get(normalizeStateCode(pack.state)) ?? [];
    return enrichPackOperational(pack, stateReps);
  });

  const territoryOverview = buildTerritoryOverviewCards(clusters, enrichedOperational);
  const routeQueues = buildRouteQueues({
    clusters,
    enrichedPacks: enrichedOperational,
    jobs: input.jobs,
  });

  let geoVisualization = getCachedGeoVisualization(cacheKey);
  if (!geoVisualization) {
    geoVisualization = buildGeoVisualization(clusters, routePacks);
    setCachedGeoVisualization(cacheKey, geoVisualization);
  }

  const detailRanked = [...enrichedOperational].sort(
    (a, b) => b.routePackScore - a.routePackScore,
  );
  const detailIds = new Set(
    detailRanked.slice(0, MAX_PACK_DETAIL).map((pack) => pack.routePackId),
  );
  const enrichedRoutePacks = enrichedOperational.map((pack) => {
    if (!detailIds.has(pack.routePackId)) return pack;
    const stateReps = stateRepIndex.get(normalizeStateCode(pack.state)) ?? [];
    return attachPackDetail(pack, clusters, stateReps);
  });

  const workspaceStart = nowMs();
  let visualWorkspace = getCachedRouteWorkspace(cacheKey);
  if (!visualWorkspace) {
    visualWorkspace = buildRoutingVisualWorkspace({
      enrichedRoutePacks,
      routeQueues,
      geoVisualization,
      jobs: input.jobs,
      jobContexts: base.jobContexts,
      escalations: input.escalations ?? [],
      variantTitlesByMetro: input.variantTitlesByMetro ?? {},
      includeDrawerContext: true,
    });
    setCachedRouteWorkspace(cacheKey, visualWorkspace);
  }
  workspaceMs = Math.round(nowMs() - workspaceStart);
  logRoutingIntelligence("workspace-build", { ms: workspaceMs, phase: "detail" });

  const totalMs = Math.round(nowMs() - buildStart);
  const snapshot: RoutingPlanningSnapshot = {
    ...base,
    routePacks,
    territoryOverview,
    routeQueues,
    enrichedRoutePacks,
    geoVisualization,
    visualWorkspace,
    loadState: {
      phase: "detail",
      cacheHit: false,
      syncing: false,
      buildMs: totalMs,
    },
  };

  setCachedRoutingPlanning(cacheKey, snapshot);
  const payloadBytes = estimatePayloadBytes(snapshot);
  logRoutingIntelligence("payload-size", { bytes: payloadBytes, cacheHit: false });
  logRoutingIntelligence("build-complete", {
    ms: totalMs,
    clusteringMs,
    routePackMs,
    workspaceMs,
  });

  return {
    snapshot,
    meta: {
      cacheHit: false,
      totalMs,
      clusteringMs,
      routePackMs,
      workspaceMs,
      payloadBytes,
    },
  };
}

/** Empty territory — skips heavy MEL clustering caches. */
export function buildCachedEmptyRoutingPlanning(
  fetchedAt: string,
  input: {
    reps: ActiveRep[];
    jobs: BreezyJob[];
    territoryScope: string;
    escalations?: RecruiterEscalationQueueItem[];
    variantTitlesByMetro?: Record<string, string[]>;
  },
): RoutingPlanningSnapshot {
  const snapshot = attachRoutingPlanning(emptyRoutingIntelligence(fetchedAt), {
    opportunities: [],
    reps: input.reps,
    jobs: input.jobs,
    escalations: input.escalations,
    variantTitlesByMetro: input.variantTitlesByMetro,
  });
  return {
    ...snapshot,
    loadState: { phase: "detail", cacheHit: false, syncing: false, buildMs: 0 },
  };
}
