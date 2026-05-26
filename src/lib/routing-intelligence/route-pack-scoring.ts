import type { TravelBurdenIntel } from "@/lib/routing-intelligence/travel-burden";
import type { RoutePack } from "@/lib/routing-intelligence/types";

export function scoreRoutePack(
  pack: RoutePack,
  burden: TravelBurdenIntel,
): number {
  const riskWeight =
    pack.staffingRisk === "operational_risk" ? 25 : pack.staffingRisk === "staffing_pressure" ? 12 : 0;
  return Math.round(
    pack.storeCount * 4 +
      burden.routeEfficiencyScore * 0.35 +
      burden.coverageSaturation * 0.15 +
      riskWeight -
      burden.estimatedDriveBurden * 0.25,
  );
}
