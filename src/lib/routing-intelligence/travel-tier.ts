import type { RouteRiskLevel, TravelTier } from "@/lib/routing-intelligence/types";

export const TRAVEL_TIER_LABELS: Record<TravelTier, string> = {
  1: "Tier 1 · <20 mi",
  2: "Tier 2 · 20–40 mi",
  3: "Tier 3 · 40–60 mi",
  4: "Tier 4 · 60+ mi / overnight",
};

export function travelTierFromNearestRepMiles(miles: number | null): TravelTier {
  if (miles === null) return 4;
  if (miles < 20) return 1;
  if (miles < 40) return 2;
  if (miles < 60) return 3;
  return 4;
}

export function routeRiskFromTierAndBurden(
  tier: TravelTier,
  driveBurdenScore: number,
  openStores: number,
): RouteRiskLevel {
  if (tier === 4 || driveBurdenScore >= 75) return "operational_risk";
  if (tier >= 3 || driveBurdenScore >= 50 || openStores >= 8) return "staffing_pressure";
  return "healthy";
}

export const ROUTE_RISK_STYLES: Record<RouteRiskLevel, string> = {
  healthy: "border-emerald-500/35 bg-emerald-500/10 text-emerald-100",
  staffing_pressure: "border-amber-500/35 bg-amber-500/10 text-amber-100",
  operational_risk: "border-red-500/35 bg-red-500/10 text-red-100",
};

/** Visual route canvas tier colors — operational planning workspace. */
export const TRAVEL_TIER_CANVAS_STYLES: Record<TravelTier, string> = {
  1: "border-emerald-500/50 bg-emerald-500/15 ring-1 ring-emerald-500/30",
  2: "border-sky-500/50 bg-sky-500/15 ring-1 ring-sky-500/30",
  3: "border-amber-500/50 bg-amber-500/15 ring-1 ring-amber-500/30",
  4: "border-red-500/50 bg-red-500/15 ring-1 ring-red-500/30",
};

export const TRAVEL_TIER_DOT_STYLES: Record<TravelTier, string> = {
  1: "bg-emerald-400",
  2: "bg-sky-400",
  3: "bg-amber-400",
  4: "bg-red-400",
};

export function severityForRouteRisk(risk: RouteRiskLevel): "critical" | "high" | "medium" | "low" {
  if (risk === "operational_risk") return "critical";
  if (risk === "staffing_pressure") return "high";
  return "medium";
}
