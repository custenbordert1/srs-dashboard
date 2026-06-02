import { DM_TERRITORY_ASSIGNMENTS } from "@/lib/dm-portal/dm-territory-assignments";

function buildTerritoryMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [dm, states] of Object.entries(DM_TERRITORY_ASSIGNMENTS)) {
    for (const state of states) {
      map[state] = dm;
    }
  }
  return map;
}

export const DM_TERRITORY_MAP = buildTerritoryMap();

export type DistrictManager = keyof typeof DM_TERRITORY_ASSIGNMENTS;

export const DISTRICT_MANAGERS = Object.keys(DM_TERRITORY_ASSIGNMENTS).sort((a, b) =>
  a.localeCompare(b),
) as DistrictManager[];

export function normalizeStateCode(raw: string): string {
  const value = raw.trim().toUpperCase();
  return value.length === 2 ? value : value.slice(0, 2);
}

export function getDmForState(rawState: string): DistrictManager | undefined {
  const state = normalizeStateCode(rawState);
  const dm = DM_TERRITORY_MAP[state as keyof typeof DM_TERRITORY_MAP];
  return dm as DistrictManager | undefined;
}

export function getAssignedStatesForDm(dm: string): string[] {
  const states = DM_TERRITORY_ASSIGNMENTS[dm as keyof typeof DM_TERRITORY_ASSIGNMENTS];
  if (!states) return [];
  return [...states].sort((a, b) => a.localeCompare(b));
}

export function resolveDmName(rawManager: string, rawState: string): string {
  const manager = rawManager.trim();
  if (manager && manager !== "—" && manager.toLowerCase() !== "unassigned") return manager;
  return getDmForState(rawState) ?? "Unassigned";
}
