import type { RouteQueueRow, RouteQueueType } from "@/lib/routing-intelligence/route-queue";

export type RouteQueueFilter = RouteQueueType | "all";

export type RouteQueueSort = "difficulty" | "stores" | "miles" | "tier";

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
      return copy.sort((a, b) => b.openStoreCount - a.openStoreCount);
    case "miles":
      return copy.sort((a, b) => b.estimatedMiles - a.estimatedMiles);
    case "tier":
      return copy.sort((a, b) => b.travelTier - a.travelTier);
    case "difficulty":
    default:
      return copy.sort((a, b) => b.routeDifficulty - a.routeDifficulty);
  }
}

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
