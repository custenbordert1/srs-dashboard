import type { RouteQueueRow, RouteQueueType } from "@/lib/routing-intelligence/route-queue";

export type RouteQueueFilter = RouteQueueType | "all";

export type RouteQueueSort =
  | "difficulty"
  | "stores"
  | "miles"
  | "tier"
  | "driveBurden"
  | "overnight"
  | "openStores"
  | "nearbyReps"
  | "staffingPressure"
  | "efficiency"
  | "saturation";

export function filterRouteQueue(
  rows: RouteQueueRow[],
  filter: RouteQueueFilter,
  search = "",
): RouteQueueRow[] {
  const needle = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter !== "all" && row.queueType !== filter) return false;
    if (!needle) return true;
    return (
      row.label.toLowerCase().includes(needle) ||
      row.city.toLowerCase().includes(needle) ||
      row.state.toLowerCase().includes(needle) ||
      row.suggestedAction.toLowerCase().includes(needle)
    );
  });
}

export function sortRouteQueue(rows: RouteQueueRow[], sort: RouteQueueSort): RouteQueueRow[] {
  const copy = [...rows];
  switch (sort) {
    case "stores":
    case "openStores":
      return copy.sort((a, b) => b.openStoreCount - a.openStoreCount);
    case "miles":
      return copy.sort((a, b) => b.estimatedMiles - a.estimatedMiles);
    case "tier":
      return copy.sort((a, b) => b.travelTier - a.travelTier);
    case "driveBurden":
      return copy.sort((a, b) => b.driveBurden - a.driveBurden);
    case "overnight":
      return copy.sort((a, b) => b.overnightPercent - a.overnightPercent);
    case "nearbyReps":
      return copy.sort((a, b) => b.nearbyRepCount - a.nearbyRepCount);
    case "staffingPressure":
      return copy.sort((a, b) => b.staffingPressure - a.staffingPressure);
    case "efficiency":
      return copy.sort((a, b) => b.routeEfficiency - a.routeEfficiency);
    case "saturation":
      return copy.sort((a, b) => b.territorySaturation - a.territorySaturation);
    case "difficulty":
    default:
      return copy.sort((a, b) => b.routeDifficulty - a.routeDifficulty);
  }
}

export const ROUTE_QUEUE_SORT_LABELS: Record<RouteQueueSort, string> = {
  difficulty: "Route difficulty",
  stores: "Stores",
  miles: "Estimated miles",
  tier: "Travel tier",
  driveBurden: "Drive burden",
  overnight: "Overnight risk",
  openStores: "Open stores",
  nearbyReps: "Nearby reps",
  staffingPressure: "Staffing pressure",
  efficiency: "Route efficiency",
  saturation: "Territory saturation",
};

export const ROUTE_QUEUE_FILTER_LABELS: Record<RouteQueueFilter, string> = {
  all: "All queues",
  uncovered: "Uncovered territories",
  overnight: "Overnight required",
  "high-mileage": "High mileage",
  "multi-store-pack": "Multi-store packs",
  "nearby-rep": "Nearby rep opportunities",
  "cluster-merge": "Cluster merge",
  "recruiting-needed": "Recruiting needed",
};
