import type { StoreCluster } from "@/lib/routing-intelligence/types";
import type { RoutePack } from "@/lib/routing-intelligence/types";
import type { RouteBurdenMetrics } from "@/lib/routing-intelligence/types";
import type { GeoVisualizationSnapshot } from "@/lib/routing-intelligence/geo-visualization";
import type { RoutingVisualWorkspace } from "@/lib/routing-intelligence/routing-workspace";
import type { RoutingPlanningSnapshot } from "@/lib/routing-intelligence/build-routing-planning";
import { logRoutingIntelligence } from "@/lib/routing-intelligence/routing-intelligence-log";

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES_PER_CACHE = 48;

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

function pruneMap<T>(map: Map<string, CacheEntry<T>>): void {
  const now = Date.now();
  for (const [key, entry] of map.entries()) {
    if (entry.expiresAt <= now) map.delete(key);
  }
  while (map.size > MAX_ENTRIES_PER_CACHE) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function getCached<T>(map: Map<string, CacheEntry<T>>, key: string): T | null {
  pruneMap(map);
  const entry = map.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function setCached<T>(map: Map<string, CacheEntry<T>>, key: string, value: T): void {
  pruneMap(map);
  map.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export type RoutingCacheKeyInput = {
  melFetchedAt: string;
  territoryScope: string;
  activeRepCount: number;
  openJobCount: number;
  opportunityCount: number;
};

export function buildRoutingCacheKey(input: RoutingCacheKeyInput): string {
  return [
    input.melFetchedAt,
    input.territoryScope,
    `reps:${input.activeRepCount}`,
    `jobs:${input.openJobCount}`,
    `mel:${input.opportunityCount}`,
  ].join("|");
}

const geoClusterCache = new Map<string, CacheEntry<StoreCluster[]>>();
const routePackCache = new Map<string, CacheEntry<RoutePack[]>>();
const travelMetricsCache = new Map<string, CacheEntry<RouteBurdenMetrics>>();
const routeWorkspaceCache = new Map<string, CacheEntry<RoutingVisualWorkspace>>();
const geoVisualizationCache = new Map<string, CacheEntry<GeoVisualizationSnapshot>>();
const fullPlanningCache = new Map<string, CacheEntry<RoutingPlanningSnapshot>>();

export function getCachedGeoClusters(key: string): StoreCluster[] | null {
  const hit = getCached(geoClusterCache, key);
  if (hit) logRoutingIntelligence("cache-hit", { layer: "geoCluster" });
  return hit;
}

export function setCachedGeoClusters(key: string, clusters: StoreCluster[]): void {
  setCached(geoClusterCache, key, clusters);
  logRoutingIntelligence("cache-store", { layer: "geoCluster", clusters: clusters.length });
}

export function getCachedRoutePacks(key: string): RoutePack[] | null {
  const hit = getCached(routePackCache, key);
  if (hit) logRoutingIntelligence("cache-hit", { layer: "routePack" });
  return hit;
}

export function setCachedRoutePacks(key: string, packs: RoutePack[]): void {
  setCached(routePackCache, key, packs);
  logRoutingIntelligence("cache-store", { layer: "routePack", packs: packs.length });
}

export function getCachedTravelMetrics(packKey: string): RouteBurdenMetrics | null {
  return getCached(travelMetricsCache, packKey);
}

export function setCachedTravelMetrics(packKey: string, metrics: RouteBurdenMetrics): void {
  setCached(travelMetricsCache, packKey, metrics);
}

export function getCachedRouteWorkspace(key: string): RoutingVisualWorkspace | null {
  const hit = getCached(routeWorkspaceCache, key);
  if (hit) logRoutingIntelligence("cache-hit", { layer: "routeWorkspace" });
  return hit;
}

export function setCachedRouteWorkspace(key: string, workspace: RoutingVisualWorkspace): void {
  setCached(routeWorkspaceCache, key, workspace);
  logRoutingIntelligence("cache-store", { layer: "routeWorkspace" });
}

export function getCachedGeoVisualization(key: string): GeoVisualizationSnapshot | null {
  const hit = getCached(geoVisualizationCache, key);
  if (hit) logRoutingIntelligence("cache-hit", { layer: "geoVisualization" });
  return hit;
}

export function setCachedGeoVisualization(key: string, geo: GeoVisualizationSnapshot): void {
  setCached(geoVisualizationCache, key, geo);
  logRoutingIntelligence("cache-store", { layer: "geoVisualization" });
}

export function getCachedRoutingPlanning(key: string): RoutingPlanningSnapshot | null {
  const hit = getCached(fullPlanningCache, key);
  if (hit) logRoutingIntelligence("cache-hit", { layer: "fullPlanning" });
  return hit;
}

export function setCachedRoutingPlanning(key: string, snapshot: RoutingPlanningSnapshot): void {
  setCached(fullPlanningCache, key, snapshot);
  logRoutingIntelligence("cache-store", { layer: "fullPlanning" });
}

export function clearRoutingIntelligenceCaches(): void {
  geoClusterCache.clear();
  routePackCache.clear();
  travelMetricsCache.clear();
  routeWorkspaceCache.clear();
  geoVisualizationCache.clear();
  fullPlanningCache.clear();
}

export function estimatePayloadBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return 0;
  }
}
