import type { BreezyJob } from "@/lib/breezy-api";
import { normalizeJobLocationFields } from "@/lib/job-management/normalize-job-location-fields";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";
import { expandMetroCities } from "@/lib/job-management/job-metro-expansion";
import { milesBetweenRepAndProject } from "@/lib/rep-intelligence/distance-engine";
import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import type { CoverageRecommendation } from "@/lib/recruiting-decision-intelligence/types";
import {
  buildStoreClusters,
  countStoresNearCity,
  findClusterForJob,
} from "@/lib/routing-intelligence/route-cluster";
import {
  buildRoutePacksFromClusters,
  matchRoutePacksForJob,
} from "@/lib/routing-intelligence/route-pack-builder";
import type {
  JobRoutingContext,
  NearbyRepRoutingRow,
  RouteIntelligenceCardRow,
  RoutingIntelligenceSnapshot,
} from "@/lib/routing-intelligence/types";
import {
  routeRiskFromTierAndBurden,
  severityForRouteRisk,
  travelTierFromNearestRepMiles,
  TRAVEL_TIER_LABELS,
} from "@/lib/routing-intelligence/travel-tier";

function nearestRepsForJob(reps: ActiveRep[], city: string, state: string, limit = 5): NearbyRepRoutingRow[] {
  const project = { city, state };
  const rows: NearbyRepRoutingRow[] = [];
  for (const rep of reps) {
    const distanceMiles = milesBetweenRepAndProject(rep, project);
    rows.push({
      repId: rep.repId,
      repName: rep.name,
      distanceMiles,
      active: rep.active,
      travelRadiusMiles: rep.travelRadius,
    });
  }
  return rows
    .filter((row) => row.distanceMiles !== null)
    .sort((a, b) => (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999))
    .slice(0, limit);
}

function activeRepsWithin(reps: NearbyRepRoutingRow[], miles: number): number {
  return reps.filter((row) => row.active && row.distanceMiles !== null && row.distanceMiles <= miles).length;
}

function buildJobRoutingContext(input: {
  job: BreezyJob;
  reps: ActiveRep[];
  clusters: ReturnType<typeof buildStoreClusters>;
  routePacks: ReturnType<typeof buildRoutePacksFromClusters>;
  coverage?: CoverageRecommendation;
}): JobRoutingContext {
  const location = normalizeJobLocationFields(input.job.city, input.job.state);
  const nearbyReps = nearestRepsForJob(input.reps, location.city, location.usState);
  const nearestActive = nearbyReps.find((row) => row.active);
  const nearestRepMiles = nearestActive?.distanceMiles ?? null;
  const travelTier = travelTierFromNearestRepMiles(nearestRepMiles);
  const storeCluster = findClusterForJob(input.clusters, location.city, location.usState);
  const nearbyOpenStores = countStoresNearCity(input.clusters, location.city, location.usState, 25);
  const clusteredOpportunities = storeCluster?.storeCount ?? nearbyOpenStores;
  const packIds = matchRoutePacksForJob(input.routePacks, location.city, location.usState);
  const relatedPack = input.routePacks.find((pack) => packIds.includes(pack.routePackId));

  const driveBurdenScore = Math.min(
    100,
    Math.round(
      (nearestRepMiles ?? 65) * 0.9 +
        clusteredOpportunities * 5 +
        (relatedPack?.overnightRequired ? 18 : 0) +
        (input.coverage?.staffingRiskScore ?? 0) * 0.15,
    ),
  );
  const estimatedRouteDifficulty = Math.min(
    100,
    Math.round(driveBurdenScore * 0.7 + (travelTier === 4 ? 25 : travelTier === 3 ? 12 : 0)),
  );
  const overnightRisk =
    relatedPack?.overnightRequired ??
    (nearestRepMiles !== null && nearestRepMiles > 45 && clusteredOpportunities >= 3);

  const routeGroupingRecommendations: string[] = [];
  if (relatedPack) routeGroupingRecommendations.push(relatedPack.groupingRecommendation);
  if (input.coverage?.recommendedExpansionCities.length) {
    const cities = input.coverage.recommendedExpansionCities.slice(1, 4);
    if (cities.length > 1) {
      routeGroupingRecommendations.push(
        `Recommend combining ${cities.join(" + ")}`,
      );
    }
  }
  const metro = expandMetroCities(location.city, location.usState, 4);
  if (metro.length > 1 && !routeGroupingRecommendations.some((line) => line.includes("combining"))) {
    routeGroupingRecommendations.push(`Metro cluster: ${metro.join(" + ")}`);
  }

  const riskLevel = routeRiskFromTierAndBurden(travelTier, driveBurdenScore, clusteredOpportunities);

  return {
    jobId: input.job.jobId,
    nearbyRepCount: activeRepsWithin(nearbyReps, 25),
    nearestRepMiles,
    travelTier,
    travelTierLabel: TRAVEL_TIER_LABELS[travelTier],
    nearbyOpenStores,
    clusteredOpportunities,
    estimatedRouteDifficulty,
    overnightRisk,
    driveBurdenScore,
    routeGroupingRecommendations,
    nearbyReps,
    storeCluster,
    relatedRoutePackIds: packIds,
    riskLevel,
    manualOnly: true,
  };
}

function cardFromPack(pack: ReturnType<typeof buildRoutePacksFromClusters>[number]): RouteIntelligenceCardRow {
  return {
    id: pack.routePackId,
    title: pack.label,
    subtitle: pack.groupingRecommendation,
    severity: severityForRouteRisk(pack.staffingRisk),
    riskLevel: pack.staffingRisk,
    travelTier: pack.travelTier,
    routePackId: pack.routePackId,
    manualOnly: true,
  };
}

export function buildRoutingIntelligence(input: {
  fetchedAt: string;
  opportunities: MelOpportunity[];
  reps: ActiveRep[];
  jobs: BreezyJob[];
  coverageRecommendations?: CoverageRecommendation[];
  escalations?: RecruiterEscalationQueueItem[];
}): RoutingIntelligenceSnapshot {
  const clusters = buildStoreClusters(input.opportunities);
  const routePacks = buildRoutePacksFromClusters(clusters, input.reps);
  const coverageByJob = new Map(
    (input.coverageRecommendations ?? []).map((row) => [row.jobId, row]),
  );

  const jobContexts: Record<string, JobRoutingContext> = {};

  for (const coverage of input.coverageRecommendations ?? []) {
    const existing = input.jobs.find((job) => job.jobId === coverage.jobId);
    if (!existing) continue;
    jobContexts[coverage.jobId] = buildJobRoutingContext({
      job: existing,
      reps: input.reps,
      clusters,
      routePacks,
      coverage,
    });
  }

  const routeRiskQueue = routePacks
    .filter((pack) => pack.staffingRisk !== "healthy")
    .slice(0, 10)
    .map(cardFromPack);

  const uncoveredTerritories: RouteIntelligenceCardRow[] = [];
  for (const cluster of clusters.filter((row) => row.storeCount >= 2)) {
    const nearest = nearestRepsForJob(input.reps, cluster.city, cluster.state, 1)[0];
    const miles = nearest?.distanceMiles ?? null;
    if (miles !== null && miles <= 45) continue;
    uncoveredTerritories.push({
      id: `uncovered:${cluster.clusterId}`,
      title: cluster.label,
      subtitle: `${cluster.storeCount} open stores · no active rep within 45 miles`,
      severity: "critical",
      riskLevel: "operational_risk",
      manualOnly: true,
    });
    if (uncoveredTerritories.length >= 8) break;
  }

  const overnightRisk = routePacks
    .filter((pack) => pack.overnightRequired)
    .slice(0, 8)
    .map(cardFromPack);

  const clusterOpportunities: RouteIntelligenceCardRow[] = clusters
    .filter((row) => row.storeCount >= 3)
    .slice(0, 8)
    .map((cluster) => ({
      id: cluster.clusterId,
      title: cluster.label,
      subtitle: `${cluster.storeCount} stores · ${cluster.clusterRadiusMiles}mi cluster radius`,
      severity: cluster.storeCount >= 6 ? "high" : "medium",
      riskLevel: cluster.storeCount >= 6 ? "staffing_pressure" : "healthy",
      manualOnly: true,
    }));

  const multiStoreRoutePacks = routePacks
    .filter((pack) => pack.storeCount >= 4)
    .slice(0, 8)
    .map(cardFromPack);

  const nearbyRepCoverage: RouteIntelligenceCardRow[] = routePacks
    .filter((pack) => pack.nearestActiveRepMiles !== null && pack.nearestActiveRepMiles <= 25)
    .slice(0, 6)
    .map((pack) => ({
      id: `rep-cover:${pack.routePackId}`,
      title: pack.label,
      subtitle: `Nearest active rep ${Math.round(pack.nearestActiveRepMiles!)}mi · ${pack.storeCount} stores`,
      severity: "medium",
      riskLevel: "healthy",
      travelTier: pack.travelTier,
      routePackId: pack.routePackId,
      manualOnly: true,
    }));

  const highTravelBurdenJobs: RouteIntelligenceCardRow[] = Object.values(jobContexts)
    .filter((ctx) => ctx.driveBurdenScore >= 65)
    .sort((a, b) => b.driveBurdenScore - a.driveBurdenScore)
    .slice(0, 8)
    .map((ctx) => {
      const job = input.jobs.find((row) => row.jobId === ctx.jobId);
      return {
        id: `burden:${ctx.jobId}`,
        title: job?.name ?? ctx.jobId,
        subtitle: `Drive burden ${ctx.driveBurdenScore} · ${ctx.travelTierLabel}`,
        severity: severityForRouteRisk(ctx.riskLevel),
        riskLevel: ctx.riskLevel,
        travelTier: ctx.travelTier,
        jobId: ctx.jobId,
        manualOnly: true,
      };
    });

  return {
    fetchedAt: input.fetchedAt,
    manualOnly: true,
    jobContexts,
    routePacks,
    routeRiskQueue,
    uncoveredTerritories,
    overnightRisk,
    clusterOpportunities,
    multiStoreRoutePacks,
    nearbyRepCoverage,
    highTravelBurdenJobs,
  };
}

export function emptyRoutingIntelligence(fetchedAt: string): RoutingIntelligenceSnapshot {
  return buildRoutingIntelligence({
    fetchedAt,
    opportunities: [],
    reps: [],
    jobs: [],
  });
}
