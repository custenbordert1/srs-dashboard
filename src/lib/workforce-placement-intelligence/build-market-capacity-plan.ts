import { MARKET_CAPACITY_CONFIG } from "@/lib/workforce-placement-intelligence/market-capacity-registry";
import type {
  MarketCapacityPlan,
  MarketCapacityStatus,
  MarketIntelligenceRow,
} from "@/lib/workforce-placement-intelligence/types";

function roundStoresPerRep(openStores: number, activeReps: number): number | null {
  if (openStores === 0) return null;
  const divisor = Math.max(activeReps, 1);
  return Math.round((openStores / divisor) * 10) / 10;
}

function resolveCapacityStatus(input: {
  openStoreCount: number;
  activeRepresentativeCount: number;
  recommendedNewReps: number;
  storesPerRep: number | null;
  priorityCritical: boolean;
}): MarketCapacityStatus {
  if (input.openStoreCount === 0) {
    return input.activeRepresentativeCount > 0 ? "surplus_capacity" : "healthy";
  }

  if (input.recommendedNewReps === 0) {
    return "healthy";
  }

  if (input.priorityCritical && input.recommendedNewReps >= 2) {
    return "critical";
  }

  if (input.recommendedNewReps >= 2) {
    return "understaffed";
  }

  return "watch";
}

function buildCapacityReason(input: {
  status: MarketCapacityStatus;
  openStoreCount: number;
  activeRepresentativeCount: number;
  recommendedNewReps: number;
  storesPerRep: number | null;
  priorityReason: string | null;
}): string {
  switch (input.status) {
    case "healthy":
      if (input.openStoreCount === 0) {
        return "No open store demand in this market preview snapshot.";
      }
      return "Current rep coverage is sufficient for current open store count.";
    case "surplus_capacity":
      return "Active representatives exceed current open store demand.";
    case "watch":
      return "Coverage is slightly below target — monitor hiring pipeline.";
    case "understaffed":
      return "High open store count and low active rep coverage.";
    case "critical":
      return input.priorityReason
        ? `${input.priorityReason} — urgent workforce expansion recommended.`
        : "Critical staffing gap — immediate hiring recommended.";
    default:
      return "Capacity review recommended.";
  }
}

export function buildMarketCapacityPlan(market: MarketIntelligenceRow): MarketCapacityPlan {
  const { openStoreCount, activeRepresentativeCount } = market;
  const storesPerRep = roundStoresPerRep(openStoreCount, activeRepresentativeCount);
  const config = MARKET_CAPACITY_CONFIG;

  const idealRepresentativeCount =
    openStoreCount >= config.minOpenStoresForHiring
      ? Math.ceil(openStoreCount / config.planningTargetStoresPerRep)
      : activeRepresentativeCount;

  let recommendedNewReps = Math.max(0, idealRepresentativeCount - activeRepresentativeCount);

  if (
    openStoreCount > 0 &&
    storesPerRep != null &&
    storesPerRep <= config.healthyStoresPerRep &&
    activeRepresentativeCount > 0
  ) {
    recommendedNewReps = 0;
  }

  const status = resolveCapacityStatus({
    openStoreCount,
    activeRepresentativeCount,
    recommendedNewReps,
    storesPerRep,
    priorityCritical: market.priorityOverride?.level === "critical",
  });

  const reason = buildCapacityReason({
    status,
    openStoreCount,
    activeRepresentativeCount,
    recommendedNewReps,
    storesPerRep,
    priorityReason: market.priorityOverride?.reason ?? null,
  });

  return {
    marketKey: market.marketKey,
    marketLabel: market.marketLabel,
    demandScore: market.demandScore,
    openStoreCount,
    activeRepresentativeCount,
    recommendedNewReps,
    idealRepresentativeCount,
    storesPerRep,
    status,
    statusLabel: capacityStatusLabel(status),
    reason,
    previewOnly: true,
  };
}

export function capacityStatusLabel(status: MarketCapacityStatus): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "surplus_capacity":
      return "Surplus Capacity";
    case "watch":
      return "Watch";
    case "understaffed":
      return "Understaffed";
    case "critical":
      return "Critical";
    default:
      return "Unknown";
  }
}

export function buildMarketCapacityPlans(markets: MarketIntelligenceRow[]): MarketCapacityPlan[] {
  return markets
    .map(buildMarketCapacityPlan)
    .sort(
      (a, b) =>
        b.recommendedNewReps - a.recommendedNewReps ||
        b.demandScore - a.demandScore ||
        a.marketLabel.localeCompare(b.marketLabel),
    );
}

export function buildWorkforcePlanningMetrics(plans: MarketCapacityPlan[]) {
  const totalRecommendedNewReps = plans.reduce((sum, row) => sum + row.recommendedNewReps, 0);
  const understaffedMarketCount = plans.filter(
    (row) => row.status === "understaffed" || row.status === "critical",
  ).length;
  const healthyMarketCount = plans.filter((row) => row.status === "healthy").length;
  const watchMarketCount = plans.filter((row) => row.status === "watch").length;

  return {
    totalRecommendedNewReps,
    understaffedMarketCount,
    healthyMarketCount,
    watchMarketCount,
    marketsNeedingHires: plans.filter((row) => row.recommendedNewReps > 0).length,
  };
}
