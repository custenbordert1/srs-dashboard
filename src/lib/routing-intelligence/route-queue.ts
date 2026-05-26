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
  driveBurden: number;
  routeEfficiency: number;
  territorySaturation: number;
  staffingPressure: number;
  overnightPercent: number;
  openJobCount: number;
  manualOnly: true;
};

function staffingPressureScore(risk: RouteRiskLevel, burden: number): number {
  const base = risk === "operational_risk" ? 85 : risk === "staffing_pressure" ? 60 : 30;
  return Math.min(100, Math.round((base + burden) / 2));
}

function queueMetricsFromPack(
  pack: EnrichedRoutePack | undefined,
  risk: RouteRiskLevel,
): Pick<
  RouteQueueRow,
  | "driveBurden"
  | "routeEfficiency"
  | "territorySaturation"
  | "staffingPressure"
  | "overnightPercent"
> {
  const burden = pack?.burden;
  const driveBurden = burden?.estimatedDriveBurden ?? 70;
  return {
    driveBurden,
    routeEfficiency: burden?.routeEfficiencyScore ?? 40,
    territorySaturation: burden?.coverageSaturation ?? 50,
    staffingPressure: staffingPressureScore(risk, driveBurden),
    overnightPercent: burden?.estimatedOvernightLikelihood ?? (pack?.overnightRequired ? 80 : 20),
  };
}

const QUEUE_ACTIONS: Record<RouteQueueType, string> = {
  uncovered: "Recruit or assign coverage — no rep within 45mi",
  overnight: "Plan overnight lodging before scheduling route",
  "high-mileage": "Review multi-day staffing before dispatch",
  "multi-store-pack": "Group stores into route pack manually",
  "nearby-rep": "Leverage nearby rep for coverage or recruiting",
  "cluster-merge": "Merge adjacent city clusters into one route",
  "recruiting-needed": "Increase recruiting in high-saturation market",
};

function openJobsForPack(pack: EnrichedRoutePack | undefined, jobs: BreezyJob[]): number {
  if (!pack) return 0;
  const cities = new Set(pack.cities.map((c) => c.toLowerCase()));
  return jobs.filter((job) => {
    const city = job.city.toLowerCase();
    return job.state.toUpperCase() === pack.state.toUpperCase() && cities.has(city);
  }).length;
}

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
      rows.push(
        queueRowFromCluster(cluster, "uncovered", pack, repCount, tier, input.jobs),
      );
    }
    if (pack?.overnightRequired) {
      rows.push(queueRowFromPack(pack, "overnight", cluster.storeCount, input.jobs));
    }
    if (pack && pack.estimatedMiles >= 120) {
      rows.push(queueRowFromPack(pack, "high-mileage", cluster.storeCount, input.jobs));
    }
    if (pack && pack.storeCount >= 4) {
      rows.push(queueRowFromPack(pack, "multi-store-pack", cluster.storeCount, input.jobs));
    }
    if (pack && pack.nearestActiveRepMiles !== null && pack.nearestActiveRepMiles <= 25) {
      rows.push(queueRowFromPack(pack, "nearby-rep", cluster.storeCount, input.jobs));
    }
    if (cluster.storeCount >= 3 && (pack?.cities.length ?? 0) > 1) {
      rows.push(queueRowFromPack(pack!, "cluster-merge", cluster.storeCount, input.jobs));
    }
    if (pack && pack.burden.coverageSaturation >= 60) {
      rows.push(queueRowFromPack(pack, "recruiting-needed", cluster.storeCount, input.jobs));
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
  jobs: BreezyJob[],
): RouteQueueRow {
  const risk = pack?.staffingRisk ?? "operational_risk";
  const metrics = queueMetricsFromPack(pack, risk);
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
    riskLevel: risk,
    openJobCount: openJobsForPack(pack, jobs),
    ...metrics,
    manualOnly: true,
  };
}

function queueRowFromPack(
  pack: EnrichedRoutePack,
  queueType: RouteQueueType,
  openStoreCount: number,
  jobs: BreezyJob[],
): RouteQueueRow {
  const repCount = pack.nearestActiveRepMiles !== null && pack.nearestActiveRepMiles <= 25 ? 1 : 0;
  const metrics = queueMetricsFromPack(pack, pack.staffingRisk);
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
    openJobCount: openJobsForPack(pack, jobs),
    ...metrics,
    manualOnly: true,
  };
}
