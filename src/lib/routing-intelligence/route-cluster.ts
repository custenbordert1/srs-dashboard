import { normalizeStateCode } from "@/lib/dm-territory-map";
import { normalizeJobLocationFields } from "@/lib/job-management/normalize-job-location-fields";
import { haversineMiles, estimateGeoPoint } from "@/lib/mel-matching/distance-utils";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { RoutingStoreRef, StoreCluster } from "@/lib/routing-intelligence/types";

function cityClusterKey(city: string, state: string): string {
  const location = normalizeJobLocationFields(city, state);
  return `${location.city.toLowerCase()}|${normalizeStateCode(location.usState)}`;
}

function clusterRadiusMiles(stores: RoutingStoreRef[]): number {
  const points = stores
    .map((store) => estimateGeoPoint(store.city, store.state))
    .filter((point): point is NonNullable<typeof point> => point !== null);
  if (points.length <= 1) return points.length === 1 ? 0 : 8;
  let max = 0;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const miles = haversineMiles(points[i]!, points[j]!);
      if (miles > max) max = miles;
    }
  }
  return Math.max(8, Math.round(max));
}

export function buildStoreClusters(opportunities: MelOpportunity[]): StoreCluster[] {
  const open = opportunities.filter((row) => row.openStatus && !row.isStaffed);
  const byCity = new Map<string, RoutingStoreRef[]>();

  for (const row of open) {
    const key = cityClusterKey(row.city, row.state);
    const list = byCity.get(key) ?? [];
    list.push({
      opportunityId: row.opportunityId,
      storeName: row.storeName,
      projectName: row.projectName,
      city: normalizeJobLocationFields(row.city, row.state).city,
      state: normalizeStateCode(row.state),
    });
    byCity.set(key, list);
  }

  const clusters: StoreCluster[] = [];
  for (const [key, stores] of byCity.entries()) {
    const [cityRaw, state] = key.split("|");
    const city = cityRaw
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    const radius = clusterRadiusMiles(stores);
    clusters.push({
      clusterId: `cluster:${key}`,
      label: `${city}, ${state}`,
      city,
      state,
      storeCount: stores.length,
      openStoreCalls: stores.length,
      clusterRadiusMiles: radius,
      stores,
    });
  }

  return clusters.sort((a, b) => b.storeCount - a.storeCount || b.clusterRadiusMiles - a.clusterRadiusMiles);
}

export function findClusterForJob(
  clusters: StoreCluster[],
  city: string,
  state: string,
): StoreCluster | null {
  const key = cityClusterKey(city, state);
  return clusters.find((row) => row.clusterId === `cluster:${key}`) ?? null;
}

export function countStoresNearCity(
  clusters: StoreCluster[],
  city: string,
  state: string,
  radiusMiles: number,
): number {
  const anchor = estimateGeoPoint(city, state);
  if (!anchor) {
    const direct = findClusterForJob(clusters, city, state);
    return direct?.storeCount ?? 0;
  }
  let total = 0;
  for (const cluster of clusters) {
    const point = estimateGeoPoint(cluster.city, cluster.state);
    if (!point) continue;
    const miles = haversineMiles(anchor, point);
    if (miles <= radiusMiles) total += cluster.storeCount;
  }
  return total;
}
