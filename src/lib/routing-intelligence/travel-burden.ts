import type { RouteBurdenMetrics, TravelTier } from "@/lib/routing-intelligence/types";

export type TravelBurdenIntel = RouteBurdenMetrics;

export function computeTravelBurdenIntel(
  pack: {
    estimatedMiles: number;
    estimatedDriveTimeMinutes: number;
    storeCount: number;
    overnightRequired: boolean;
    nearestActiveRepMiles: number | null;
    travelTier: TravelTier;
    clusterRadiusMiles: number;
  },
  activeRepsWithin50 = 0,
): TravelBurdenIntel {
  const nearest = pack.nearestActiveRepMiles ?? 70;
  const estimatedDriveBurden = Math.min(
    100,
    Math.round(
      pack.estimatedMiles * 0.35 +
        nearest * 0.45 +
        pack.clusterRadiusMiles * 0.2 +
        (pack.overnightRequired ? 15 : 0),
    ),
  );

  const estimatedOvernightLikelihood = Math.min(
    100,
    Math.round(
      (pack.overnightRequired ? 75 : 0) +
        (pack.estimatedDriveTimeMinutes > 480 ? 20 : 0) +
        (nearest > 45 ? 15 : 0),
    ),
  );

  const driveDays = Math.max(1, Math.ceil(pack.estimatedDriveTimeMinutes / 480));
  const multiDayRouteProbability = Math.min(
    100,
    Math.round((driveDays - 1) * 35 + (pack.storeCount > 8 ? 25 : 0)),
  );

  const repCoverageFactor = Math.min(100, activeRepsWithin50 * 25);
  const storePressure = Math.min(100, pack.storeCount * 8);
  const coverageSaturation = Math.min(
    100,
    Math.round(storePressure - repCoverageFactor + (nearest > 40 ? 20 : 0)),
  );

  const milesPerStore =
    pack.storeCount > 0 ? pack.estimatedMiles / pack.storeCount : pack.estimatedMiles;
  const tierPenalty = pack.travelTier === 1 ? 0 : pack.travelTier === 2 ? 8 : pack.travelTier === 3 ? 18 : 30;
  const routeEfficiencyScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          milesPerStore * 2.5 -
          tierPenalty -
          (pack.overnightRequired ? 12 : 0) +
          repCoverageFactor * 0.3,
      ),
    ),
  );

  return {
    estimatedDriveBurden,
    estimatedOvernightLikelihood,
    multiDayRouteProbability,
    coverageSaturation,
    routeEfficiencyScore,
  };
}

export function travelTierLabelExtended(tier: TravelTier, overnight: boolean): string {
  if (overnight && tier < 4) return `Tier ${tier} · overnight risk`;
  if (tier === 4) return "Tier 4 · 60+ mi / overnight";
  if (tier === 3) return "Tier 3 · 40–60 mi";
  if (tier === 2) return "Tier 2 · 20–40 mi";
  return "Tier 1 · <20 mi";
}
