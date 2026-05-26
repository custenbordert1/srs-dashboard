import type { EnrichedRoutePack } from "@/lib/routing-intelligence/types";
import type { StoreCluster } from "@/lib/routing-intelligence/types";
import type { DmAlertPriority } from "@/lib/dm-dashboard/dm-alert-priority";

export type TerritoryOverviewCardId =
  | "highest-travel-burden"
  | "largest-uncovered"
  | "best-route-pack"
  | "highest-overnight"
  | "strongest-rep-market"
  | "largest-store-cluster";

export type TerritoryOverviewCard = {
  id: TerritoryOverviewCardId;
  title: string;
  headline: string;
  detail: string;
  severity: DmAlertPriority;
  routePackId?: string;
  clusterId?: string;
  manualOnly: true;
};

export function buildTerritoryOverviewCards(
  clusters: StoreCluster[],
  enrichedPacks: EnrichedRoutePack[],
): TerritoryOverviewCard[] {
  const highestBurden = [...enrichedPacks].sort(
    (a, b) => b.burden.estimatedDriveBurden - a.burden.estimatedDriveBurden,
  )[0];
  const largestUncovered = [...enrichedPacks]
    .filter((pack) => pack.nearestActiveRepMiles === null || pack.nearestActiveRepMiles > 45)
    .sort((a, b) => b.storeCount - a.storeCount)[0];
  const bestPack = [...enrichedPacks].sort((a, b) => b.routePackScore - a.routePackScore)[0];
  const highestOvernight = [...enrichedPacks].filter((pack) => pack.overnightRequired)
    .sort((a, b) => b.burden.estimatedOvernightLikelihood - a.burden.estimatedOvernightLikelihood)[0];
  const strongestRep = [...enrichedPacks]
    .filter((pack) => pack.nearestActiveRepMiles !== null && pack.nearestActiveRepMiles <= 20)
    .sort((a, b) => (a.nearestActiveRepMiles ?? 99) - (b.nearestActiveRepMiles ?? 99))[0];
  const largestCluster = [...clusters].sort((a, b) => b.storeCount - a.storeCount)[0];

  const cards: TerritoryOverviewCard[] = [
    card(
      "highest-travel-burden",
      "Highest travel burden",
      highestBurden?.label ?? "—",
      highestBurden
        ? `Drive burden ${highestBurden.burden.estimatedDriveBurden} · ${highestBurden.estimatedMiles} mi`
        : "No route packs in territory",
      highestBurden && highestBurden.burden.estimatedDriveBurden >= 70 ? "critical" : "high",
      highestBurden?.routePackId,
    ),
    card(
      "largest-uncovered",
      "Largest uncovered territory",
      largestUncovered?.label ?? "—",
      largestUncovered
        ? `${largestUncovered.storeCount} stores · nearest rep ${largestUncovered.nearestActiveRepMiles == null ? "none" : `${Math.round(largestUncovered.nearestActiveRepMiles)}mi`}`
        : "All clusters have nearby rep coverage",
      "critical",
      largestUncovered?.routePackId,
    ),
    card(
      "best-route-pack",
      "Best route-pack opportunity",
      bestPack?.label ?? "—",
      bestPack
        ? `Score ${bestPack.routePackScore} · efficiency ${bestPack.burden.routeEfficiencyScore}`
        : "No packs scored",
      "medium",
      bestPack?.routePackId,
    ),
    card(
      "highest-overnight",
      "Highest overnight risk",
      highestOvernight?.label ?? "—",
      highestOvernight
        ? `${highestOvernight.burden.estimatedOvernightLikelihood}% overnight likelihood`
        : "No overnight routes flagged",
      "high",
      highestOvernight?.routePackId,
    ),
    card(
      "strongest-rep-market",
      "Strongest nearby rep market",
      strongestRep?.label ?? "—",
      strongestRep
        ? `Rep ${Math.round(strongestRep.nearestActiveRepMiles!)}mi · ${strongestRep.storeCount} stores`
        : "No tight rep coverage markets",
      "low",
      strongestRep?.routePackId,
    ),
    card(
      "largest-store-cluster",
      "Largest open-store cluster",
      largestCluster?.label ?? "—",
      largestCluster
        ? `${largestCluster.storeCount} stores · ${largestCluster.clusterRadiusMiles}mi radius`
        : "No store clusters",
      largestCluster && largestCluster.storeCount >= 6 ? "high" : "medium",
      undefined,
      largestCluster?.clusterId,
    ),
  ];

  return cards;
}

function card(
  id: TerritoryOverviewCardId,
  title: string,
  headline: string,
  detail: string,
  severity: DmAlertPriority,
  routePackId?: string,
  clusterId?: string,
): TerritoryOverviewCard {
  return {
    id,
    title,
    headline,
    detail,
    severity,
    routePackId,
    clusterId,
    manualOnly: true,
  };
}
