import {
  getAssignedStatesForDm,
  getDmForState,
  normalizeStateCode,
  type DistrictManager,
} from "@/lib/dm-territory-map";

export type TerritoryScopedRow = {
  state?: string | null;
};

export function normalizeTerritoryStateList(states: Iterable<string>): Set<string> {
  return new Set([...states].map((s) => normalizeStateCode(s)).filter((s) => s.length === 2));
}

export function isStateInTerritory(rawState: string, territoryStates: Iterable<string>): boolean {
  const state = normalizeStateCode(rawState);
  if (!state) return false;
  return normalizeTerritoryStateList(territoryStates).has(state);
}

export function filterByTerritoryStates<T extends TerritoryScopedRow>(
  items: T[],
  territoryStates: Iterable<string>,
): T[] {
  const allowed = normalizeTerritoryStateList(territoryStates);
  if (allowed.size === 0) return items;
  return items.filter((item) => item.state && isStateInTerritory(item.state, allowed));
}

export function filterByTerritoryStatesWith<T>(
  items: T[],
  territoryStates: Iterable<string>,
  getState: (item: T) => string | null | undefined,
): T[] {
  const allowed = normalizeTerritoryStateList(territoryStates);
  if (allowed.size === 0) return items;
  return items.filter((item) => {
    const state = getState(item);
    return state ? allowed.has(normalizeStateCode(state)) : false;
  });
}

export function excludeOtherDmTerritories<T>(
  items: T[],
  dmName: string,
  getState: (item: T) => string | null | undefined,
): T[] {
  const ownStates = normalizeTerritoryStateList(getAssignedStatesForDm(dmName));
  if (ownStates.size === 0) return items;
  return items.filter((item) => {
    const state = getState(item);
    if (!state) return false;
    const code = normalizeStateCode(state);
    if (!ownStates.has(code)) return false;
    const owner = getDmForState(code);
    return owner === dmName || owner === undefined;
  });
}

export function resolveTerritoryStatesForDm(dmName: string): string[] {
  return getAssignedStatesForDm(dmName);
}

export function territoryOwnerForState(rawState: string): DistrictManager | undefined {
  return getDmForState(rawState);
}
