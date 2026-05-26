import { expandMetroCities } from "@/lib/job-management/job-metro-expansion";
import { normalizeJobLocationFields } from "@/lib/job-management/normalize-job-location-fields";
import { countRepsNearOpportunity } from "@/lib/coverage-risk-engine/rep-proximity";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import type { RoutePack, StoreCluster } from "@/lib/routing-intelligence/types";
import {
  routeRiskFromTierAndBurden,
  travelTierFromNearestRepMiles,
} from "@/lib/routing-intelligence/travel-tier";

function packId(cities: string[], state: string): string {
  return `pack:${state}:${cities.map((c) => c.toLowerCase()).sort().join("+")}`;
}

function estimatePackMetrics(storeCount: number, radiusMiles: number) {
  const estimatedMiles = Math.round(storeCount * 14 + radiusMiles * 1.8);
  const estimatedDriveTimeMinutes = Math.round(estimatedMiles * 1.4);
  const estimatedStoreHours = Math.round(storeCount * 2.5);
  const overnightRequired = estimatedDriveTimeMinutes > 600 || radiusMiles > 75;
  const suggestedRepCount = Math.max(1, Math.ceil(storeCount / 6));
  return {
    estimatedMiles,
    estimatedDriveTimeMinutes,
    estimatedStoreHours,
    overnightRequired,
    suggestedRepCount,
  };
}

function groupingRecommendationForPack(input: {
  storeCount: number;
  radiusMiles: number;
  cities: string[];
  nearestMiles: number | null;
  driveDays: number;
}): string {
  const parts: string[] = [];
  parts.push(`${input.storeCount} stores within ${Math.round(input.radiusMiles)} miles`);
  if (input.driveDays >= 2) {
    parts.push(`Can be grouped into ${input.driveDays}-day route`);
  }
  if (input.nearestMiles === null || input.nearestMiles > 45) {
    parts.push("No active rep within 45 miles");
  } else if (input.nearestMiles <= 25) {
    parts.push("Strong recruiting market nearby");
  }
  if (input.cities.length > 1) {
    parts.push(`Recommend combining ${input.cities.join(" + ")}`);
  }
  return parts.join(" · ");
}

export function buildRoutePacksFromClusters(
  clusters: StoreCluster[],
  reps: ActiveRep[],
): RoutePack[] {
  const packs: RoutePack[] = [];
  const seen = new Set<string>();

  for (const cluster of clusters) {
    if (cluster.storeCount < 2) continue;
    const metroCities = expandMetroCities(cluster.city, cluster.state, 6);
    const metroClusters = clusters.filter((row) =>
      row.state === cluster.state && metroCities.some((c) => c.toLowerCase() === row.city.toLowerCase()),
    );
    if (metroClusters.length === 0) continue;

    const cities = [...new Set(metroClusters.map((row) => row.city))];
    const id = packId(cities, cluster.state);
    if (seen.has(id)) continue;
    seen.add(id);

    const storeCount = metroClusters.reduce((sum, row) => sum + row.storeCount, 0);
    const radiusMiles = Math.max(...metroClusters.map((row) => row.clusterRadiusMiles), 18);
    const metrics = estimatePackMetrics(storeCount, radiusMiles);

    const anchorOpp: MelOpportunity = {
      opportunityId: cluster.clusterId,
      projectName: cluster.label,
      client: "",
      storeAddress: "",
      storeName: cluster.label,
      city: cluster.city,
      state: cluster.state,
      projectType: "reset",
      priority: "high",
      openStatus: true,
      territoryOwner: "",
      storeCall: "open",
      projectNo: "",
      isStaffed: false,
    };
    const proximity = countRepsNearOpportunity(reps, anchorOpp);
    const nearestMiles = proximity.nearestActiveMiles;
    const travelTier = travelTierFromNearestRepMiles(nearestMiles);
    const driveBurden = Math.min(
      100,
      Math.round(
        (nearestMiles ?? 70) * 0.8 + storeCount * 4 + (metrics.overnightRequired ? 20 : 0),
      ),
    );
    const staffingRisk = routeRiskFromTierAndBurden(travelTier, driveBurden, storeCount);
    const driveDays = Math.max(1, Math.ceil(metrics.estimatedDriveTimeMinutes / 480));

    packs.push({
      routePackId: id,
      clusterId: cluster.clusterId,
      label: `Metro pack: ${cities.slice(0, 3).join(" + ")}, ${cluster.state}`,
      cities,
      state: cluster.state,
      storeCount,
      clusterRadiusMiles: radiusMiles,
      ...metrics,
      staffingRisk,
      nearbyMetroSupport: metroCities.filter((c) => !cities.includes(c)).slice(0, 3),
      groupingRecommendation: groupingRecommendationForPack({
        storeCount,
        radiusMiles,
        cities,
        nearestMiles,
        driveDays,
      }),
      nearestActiveRepMiles: nearestMiles,
      travelTier,
      manualOnly: true,
    });
  }

  return packs.sort((a, b) => {
    const rank = { operational_risk: 0, staffing_pressure: 1, healthy: 2 };
    return rank[a.staffingRisk] - rank[b.staffingRisk] || b.storeCount - a.storeCount;
  });
}

export function matchRoutePacksForJob(
  packs: RoutePack[],
  city: string,
  state: string,
): string[] {
  const location = normalizeJobLocationFields(city, state);
  const metro = expandMetroCities(location.city, location.usState, 6).map((c) => c.toLowerCase());
  return packs
    .filter(
      (pack) =>
        pack.state === normalizeJobLocationFields(city, state).usState &&
        pack.cities.some((c) => metro.includes(c.toLowerCase())),
    )
    .map((pack) => pack.routePackId);
}
