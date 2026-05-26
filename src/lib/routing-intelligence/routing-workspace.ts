import type { BreezyJob } from "@/lib/breezy-api";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";
import type { GeoVisualizationSnapshot } from "@/lib/routing-intelligence/geo-visualization";
import {
  emptyRoutingVisualFoundation,
  type RoutingVisualFoundation,
} from "@/lib/routing-intelligence/routing-visual-foundation";
import type { RouteQueueRow } from "@/lib/routing-intelligence/route-queue";
import { TRAVEL_TIER_LABELS } from "@/lib/routing-intelligence/travel-tier";
import type { EnrichedRoutePack, JobRoutingContext, TravelTier } from "@/lib/routing-intelligence/types";

export type RouteCanvasCard = {
  routePackId: string;
  label: string;
  cities: string[];
  state: string;
  storeCount: number;
  travelTier: TravelTier;
  travelTierLabel: string;
  estimatedMiles: number;
  metroGroupLabel: string | null;
  connectedCityCount: number;
  routePackScore: number;
  overnightRequired: boolean;
  manualOnly: true;
};

export type RouteWorkspaceMetrics = {
  totalEstimatedRouteMiles: number;
  avgDriveBurden: number;
  overnightPercent: number;
  multiDayPercent: number;
  routeEfficiencyScore: number;
  coverageSaturation: number;
  avgStoresPerRoutePack: number;
  avgOpenJobsPerRoutePack: number;
  routePackCount: number;
  manualOnly: true;
};

export type TerritoryStoryIndicator = {
  id: string;
  title: string;
  subtitle: string;
  routePackId?: string;
  accent: "rose" | "emerald" | "amber" | "sky" | "violet" | "teal";
  manualOnly: true;
};

export type RoutePackDrawerContext = {
  openJobIds: string[];
  relatedEscalationIds: string[];
  variantTitles: string[];
};

export type RoutingVisualWorkspace = {
  canvasCards: RouteCanvasCard[];
  metrics: RouteWorkspaceMetrics;
  storytelling: TerritoryStoryIndicator[];
  visualFoundation: RoutingVisualFoundation;
  drawerContextByPackId: Record<string, RoutePackDrawerContext>;
  manualOnly: true;
};

function openJobsForPack(pack: EnrichedRoutePack, jobs: BreezyJob[]): BreezyJob[] {
  const cities = new Set(pack.cities.map((c) => c.toLowerCase()));
  return jobs.filter((job) => {
    const city = job.city.toLowerCase();
    return job.state.toUpperCase() === pack.state.toUpperCase() && cities.has(city);
  });
}

export function buildRouteCanvasCards(
  packs: EnrichedRoutePack[],
  geo: GeoVisualizationSnapshot | undefined,
): RouteCanvasCard[] {
  return packs.map((pack) => {
    const metro = geo?.metroGroups.find((group) =>
      group.nodeIds.some((id) => id.includes(pack.clusterId)),
    );
    const connections = geo?.connections.filter(
      (line) => line.fromNodeId.includes(pack.clusterId) || line.toNodeId.includes(pack.clusterId),
    );
    return {
      routePackId: pack.routePackId,
      label: pack.label,
      cities: pack.cities,
      state: pack.state,
      storeCount: pack.storeCount,
      travelTier: pack.travelTier,
      travelTierLabel: TRAVEL_TIER_LABELS[pack.travelTier],
      estimatedMiles: pack.estimatedMiles,
      metroGroupLabel: metro?.label ?? null,
      connectedCityCount: Math.max(pack.cities.length, connections?.length ?? 0),
      routePackScore: pack.routePackScore,
      overnightRequired: pack.overnightRequired,
      manualOnly: true,
    };
  });
}

export function buildRouteWorkspaceMetrics(
  packs: EnrichedRoutePack[],
  jobs: BreezyJob[],
): RouteWorkspaceMetrics {
  if (packs.length === 0) {
    return {
      totalEstimatedRouteMiles: 0,
      avgDriveBurden: 0,
      overnightPercent: 0,
      multiDayPercent: 0,
      routeEfficiencyScore: 0,
      coverageSaturation: 0,
      avgStoresPerRoutePack: 0,
      avgOpenJobsPerRoutePack: 0,
      routePackCount: 0,
      manualOnly: true,
    };
  }

  const totalMiles = packs.reduce((sum, pack) => sum + pack.estimatedMiles, 0);
  const avgBurden =
    packs.reduce((sum, pack) => sum + pack.burden.estimatedDriveBurden, 0) / packs.length;
  const overnightCount = packs.filter((pack) => pack.overnightRequired).length;
  const multiDayCount = packs.filter((pack) => pack.burden.multiDayRouteProbability >= 50).length;
  const avgEfficiency =
    packs.reduce((sum, pack) => sum + pack.burden.routeEfficiencyScore, 0) / packs.length;
  const avgSaturation =
    packs.reduce((sum, pack) => sum + pack.burden.coverageSaturation, 0) / packs.length;
  const totalStores = packs.reduce((sum, pack) => sum + pack.storeCount, 0);
  const totalOpenJobs = packs.reduce((sum, pack) => sum + openJobsForPack(pack, jobs).length, 0);

  return {
    totalEstimatedRouteMiles: Math.round(totalMiles),
    avgDriveBurden: Math.round(avgBurden),
    overnightPercent: Math.round((overnightCount / packs.length) * 100),
    multiDayPercent: Math.round((multiDayCount / packs.length) * 100),
    routeEfficiencyScore: Math.round(avgEfficiency),
    coverageSaturation: Math.round(avgSaturation),
    avgStoresPerRoutePack: Math.round((totalStores / packs.length) * 10) / 10,
    avgOpenJobsPerRoutePack: Math.round((totalOpenJobs / packs.length) * 10) / 10,
    routePackCount: packs.length,
    manualOnly: true,
  };
}

export function buildTerritoryStorytelling(
  packs: EnrichedRoutePack[],
  queues: RouteQueueRow[],
): TerritoryStoryIndicator[] {
  if (packs.length === 0) return [];

  const highestRisk = [...packs].sort((a, b) => b.burden.estimatedDriveBurden - a.burden.estimatedDriveBurden)[0];
  const mostEfficient = [...packs].sort(
    (a, b) => b.burden.routeEfficiencyScore - a.burden.routeEfficiencyScore,
  )[0];
  const largestUncovered = queues
    .filter((row) => row.queueType === "uncovered")
    .sort((a, b) => b.openStoreCount - a.openStoreCount)[0];
  const highestOvernight = [...packs]
    .filter((pack) => pack.overnightRequired)
    .sort((a, b) => b.burden.estimatedOvernightLikelihood - a.burden.estimatedOvernightLikelihood)[0];
  const mostSaturated = [...packs].sort(
    (a, b) => b.burden.coverageSaturation - a.burden.coverageSaturation,
  )[0];
  const bestRepCoverage = [...packs]
    .filter((pack) => pack.nearestActiveRepMiles !== null)
    .sort((a, b) => (a.nearestActiveRepMiles ?? 999) - (b.nearestActiveRepMiles ?? 999))[0];

  const stories: TerritoryStoryIndicator[] = [
    {
      id: "highest-risk",
      title: "Highest risk territory",
      subtitle: `${highestRisk.label} · burden ${highestRisk.burden.estimatedDriveBurden}`,
      routePackId: highestRisk.routePackId,
      accent: "rose",
      manualOnly: true,
    },
    {
      id: "most-efficient",
      title: "Most efficient route pack",
      subtitle: `${mostEfficient.label} · efficiency ${mostEfficient.burden.routeEfficiencyScore}`,
      routePackId: mostEfficient.routePackId,
      accent: "emerald",
      manualOnly: true,
    },
    {
      id: "largest-uncovered",
      title: "Largest uncovered territory",
      subtitle: largestUncovered
        ? `${largestUncovered.label} · ${largestUncovered.openStoreCount} stores`
        : "No uncovered clusters in queue",
      routePackId: largestUncovered?.routePackId,
      accent: "amber",
      manualOnly: true,
    },
    {
      id: "highest-overnight",
      title: "Highest overnight burden",
      subtitle: highestOvernight
        ? `${highestOvernight.label} · ${highestOvernight.burden.estimatedOvernightLikelihood}% likelihood`
        : `${highestRisk.label} · monitor drive time`,
      routePackId: (highestOvernight ?? highestRisk).routePackId,
      accent: "violet",
      manualOnly: true,
    },
    {
      id: "most-saturated",
      title: "Most saturated market",
      subtitle: `${mostSaturated.label} · saturation ${mostSaturated.burden.coverageSaturation}%`,
      routePackId: mostSaturated.routePackId,
      accent: "sky",
      manualOnly: true,
    },
    {
      id: "best-rep-coverage",
      title: "Best rep coverage zone",
      subtitle: bestRepCoverage
        ? `${bestRepCoverage.label} · ${bestRepCoverage.nearestActiveRepMiles} mi nearest`
        : `${mostEfficient.label} · review rep radius`,
      routePackId: (bestRepCoverage ?? mostEfficient).routePackId,
      accent: "teal",
      manualOnly: true,
    },
  ];

  return stories;
}

export function buildDrawerContextByPack(
  packs: EnrichedRoutePack[],
  jobs: BreezyJob[],
  jobContexts: Record<string, JobRoutingContext>,
  escalations: RecruiterEscalationQueueItem[],
  variantTitlesByMetro: Record<string, string[]>,
): Record<string, RoutePackDrawerContext> {
  const out: Record<string, RoutePackDrawerContext> = {};
  for (const pack of packs) {
    const packJobs = openJobsForPack(pack, jobs);
    const jobIds = new Set(packJobs.map((job) => job.jobId));
    for (const [jobId, ctx] of Object.entries(jobContexts)) {
      if (ctx.relatedRoutePackIds.includes(pack.routePackId)) jobIds.add(jobId);
    }
    const metroKey = `${pack.state}:${pack.cities[0]?.toLowerCase() ?? ""}`;
    const variantTitles = variantTitlesByMetro[metroKey] ?? [];
    const relatedEscalationIds = escalations
      .filter((item) => {
        const city = (item.city ?? "").toLowerCase();
        return item.state === pack.state && pack.cities.some((c) => c.toLowerCase() === city);
      })
      .map((item) => item.id)
      .slice(0, 8);

    out[pack.routePackId] = {
      openJobIds: [...jobIds],
      relatedEscalationIds,
      variantTitles,
    };
  }
  return out;
}

export function buildRoutingVisualWorkspace(input: {
  enrichedRoutePacks: EnrichedRoutePack[];
  routeQueues: RouteQueueRow[];
  geoVisualization: GeoVisualizationSnapshot;
  jobs: BreezyJob[];
  jobContexts: Record<string, JobRoutingContext>;
  escalations?: RecruiterEscalationQueueItem[];
  variantTitlesByMetro?: Record<string, string[]>;
  /** Skip drawer/escalation cross-links during operational workspace build. */
  includeDrawerContext?: boolean;
}): RoutingVisualWorkspace {
  const packs = input.enrichedRoutePacks;
  const includeDrawer = input.includeDrawerContext !== false;
  return {
    canvasCards: buildRouteCanvasCards(packs, input.geoVisualization),
    metrics: buildRouteWorkspaceMetrics(packs, input.jobs),
    storytelling: buildTerritoryStorytelling(packs, input.routeQueues),
    visualFoundation: emptyRoutingVisualFoundation(),
    drawerContextByPackId: includeDrawer
      ? buildDrawerContextByPack(
          packs,
          input.jobs,
          input.jobContexts,
          input.escalations ?? [],
          input.variantTitlesByMetro ?? {},
        )
      : {},
    manualOnly: true,
  };
}
