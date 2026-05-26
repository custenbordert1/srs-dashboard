import type { BreezyJob } from "@/lib/breezy-api";
import type { EnrichedRoutePack } from "@/lib/routing-intelligence/types";
import type { StoreCluster } from "@/lib/routing-intelligence/types";
import type { TravelTier } from "@/lib/routing-intelligence/types";
import type { RouteRiskLevel } from "@/lib/routing-intelligence/types";
import { travelTierLabelExtended } from "@/lib/routing-intelligence/travel-burden";

export type RouteQueueType =
  | "uncovered"
  | "overnight"
  | "high-mileage"
  | "multi-store-pack"
  | "nearby-rep"
  | "cluster-merge"
  | "recruiting-needed";

export type RouteQueueRow = {
  id: string;
  queueType: RouteQueueType;
  city: string;
  state: string;
  label: string;
  openStoreCount: number;
  nearbyRepCount: number;
  estimatedMiles: number;
  travelTier: TravelTier;
  travelTierLabel: string;
  routeDifficulty: number;
  overnightRisk: boolean;
  suggestedAction: string;
  routePackId?: string;
  clusterId?: string;
  jobId?: string;
  routePackScore?: number;
  riskLevel: RouteRiskLevel;
  manualOnly: true;
};

const QUEUE_ACTIONS: Record<RouteQueueType, string> = {
  uncovered: "Recruit or assign coverage — no rep within 45mi",
  overnight: "Plan overnight lodging before scheduling route",
  "high-mileage": "Review multi-day staffing before dispatch",
  "multi-store-pack": "Group stores into route pack manually",
  "nearby-rep": "Leverage nearby rep for coverage or recruiting",
  "cluster-merge": "Merge adjacent city clusters into one route",
  "recruiting-needed": "Increase recruiting in high-saturation market",
};

export function buildRouteQueues(input: {
  clusters: StoreCluster[];
  enrichedPacks: EnrichedRoutePack[];
  jobs: BreezyJob[];
}): RouteQueueRow[] {
  const rows: RouteQueueRow[] = [];

  for (const cluster of input.clusters) {
    const pack = input.enrichedPacks.find((row) => row.clusterId === cluster.clusterId);
    const nearest = pack?.nearestActiveRepMiles ?? null;
    const repCount = nearest !== null && nearest <= 25 ? 1 : 0;
    const tier = pack?.travelTier ?? 4;

    if (nearest === null || nearest > 45) {
      rows.push(queueRowFromCluster(cluster, "uncovered", pack, repCount, tier));
    }
    if (pack?.overnightRequired) {
      rows.push(queueRowFromPack(pack, "overnight", cluster.storeCount));
    }
    if (pack && pack.estimatedMiles >= 120) {
      rows.push(queueRowFromPack(pack, "high-mileage", cluster.storeCount));
    }
    if (pack && pack.storeCount >= 4) {
      rows.push(queueRowFromPack(pack, "multi-store-pack", cluster.storeCount));
    }
    if (pack && pack.nearestActiveRepMiles !== null && pack.nearestActiveRepMiles <= 25) {
      rows.push(queueRowFromPack(pack, "nearby-rep", cluster.storeCount));
    }
    if (cluster.storeCount >= 3 && (pack?.cities.length ?? 0) > 1) {
      rows.push(queueRowFromPack(pack!, "cluster-merge", cluster.storeCount));
    }
    if (pack && pack.burden.coverageSaturation >= 60) {
      rows.push(queueRowFromPack(pack, "recruiting-needed", cluster.storeCount));
    }
  }

  const seen = new Set<string>();
  return rows
    .filter((row) => {
      const key = `${row.queueType}:${row.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.routeDifficulty - a.routeDifficulty);
}

function queueRowFromCluster(
  cluster: StoreCluster,
  queueType: RouteQueueType,
  pack: EnrichedRoutePack | undefined,
  nearbyRepCount: number,
  travelTier: TravelTier,
): RouteQueueRow {
  return {
    id: `${queueType}:${cluster.clusterId}`,
    queueType,
    city: cluster.city,
    state: cluster.state,
    label: cluster.label,
    openStoreCount: cluster.storeCount,
    nearbyRepCount,
    estimatedMiles: pack?.estimatedMiles ?? cluster.clusterRadiusMiles * 2,
    travelTier,
    travelTierLabel: travelTierLabelExtended(travelTier, pack?.overnightRequired ?? false),
    routeDifficulty: pack?.burden.estimatedDriveBurden ?? 70,
    overnightRisk: pack?.overnightRequired ?? false,
    suggestedAction: QUEUE_ACTIONS[queueType],
    routePackId: pack?.routePackId,
    clusterId: cluster.clusterId,
    routePackScore: pack?.routePackScore,
    riskLevel: pack?.staffingRisk ?? "operational_risk",
    manualOnly: true,
  };
}

function queueRowFromPack(
  pack: EnrichedRoutePack,
  queueType: RouteQueueType,
  openStoreCount: number,
): RouteQueueRow {
  const repCount = pack.nearestActiveRepMiles !== null && pack.nearestActiveRepMiles <= 25 ? 1 : 0;
  return {
    id: `${queueType}:${pack.routePackId}`,
    queueType,
    city: pack.cities[0] ?? "",
    state: pack.state,
    label: pack.label,
    openStoreCount,
    nearbyRepCount: repCount,
    estimatedMiles: pack.estimatedMiles,
    travelTier: pack.travelTier,
    travelTierLabel: travelTierLabelExtended(pack.travelTier, pack.overnightRequired),
    routeDifficulty: pack.burden.estimatedDriveBurden,
    overnightRisk: pack.overnightRequired,
    suggestedAction: QUEUE_ACTIONS[queueType],
    routePackId: pack.routePackId,
    clusterId: pack.clusterId,
    routePackScore: pack.routePackScore,
    riskLevel: pack.staffingRisk,
    manualOnly: true,
  };
}
