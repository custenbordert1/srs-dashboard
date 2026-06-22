import { getAssignedStatesForDm } from "@/lib/dm-territory-map";

/**
 * Territory grouping is DM + state coverage because `DM_TERRITORY_MAP` keys on state
 * codes, not metro/city names. Houston/Atlanta/Dallas are not stable ATS dimensions —
 * candidate `state` is the authoritative territory key for accountability routing.
 */
export function formatTerritoryLabel(dmName: string, states: string[]): string {
  const sorted = [...states].sort((a, b) => a.localeCompare(b));
  if (sorted.length === 0) return dmName;
  const stateSummary =
    sorted.length <= 4 ? sorted.join(", ") : `${sorted.slice(0, 3).join(", ")} +${sorted.length - 3}`;
  return `${dmName} · ${stateSummary}`;
}

export function territoryLabelForDm(dmName: string): string {
  return formatTerritoryLabel(dmName, getAssignedStatesForDm(dmName));
}
