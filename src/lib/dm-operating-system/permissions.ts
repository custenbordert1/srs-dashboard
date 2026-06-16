import { isAdminRole, isDmRole } from "@/lib/auth/roles";
import type { AuthSession } from "@/lib/auth/types";
import { normalizeTerritoryStateList } from "@/lib/dm-portal/territory-filter-service";
import { getAssignedStatesForDm } from "@/lib/dm-territory-map";
import type { DmOperatingSystemScope } from "@/lib/dm-operating-system/types";

export function canAccessDmOperatingSystem(session: AuthSession): boolean {
  return isDmRole(session.role) || isAdminRole(session.role) || session.role === "executive";
}

export function resolveDmOperatingSystemScope(session: AuthSession): DmOperatingSystemScope {
  const dmName = session.dmName?.trim() || session.name.trim() || "Unassigned";
  const fromSession = normalizeTerritoryStateList(session.territoryStates ?? []);
  const fromMap = normalizeTerritoryStateList(getAssignedStatesForDm(dmName));
  const territoryStates =
    fromSession.size > 0 ? [...fromSession].sort() : [...fromMap].sort();
  const scopedToTerritory = isDmRole(session.role) && territoryStates.length > 0;
  const territoryLabel =
    territoryStates.length > 0 ? territoryStates.join(", ") : "All territories";

  return {
    dmName,
    territoryLabel,
    territoryStates,
    role: session.role,
    scopedToTerritory,
  };
}

export function isStateInDmScope(state: string | null | undefined, scope: DmOperatingSystemScope): boolean {
  if (!scope.scopedToTerritory || scope.territoryStates.length === 0) return true;
  if (!state) return false;
  const allowed = normalizeTerritoryStateList(scope.territoryStates);
  const code = state.trim().toUpperCase().slice(0, 2);
  return allowed.has(code);
}

export function isDmNameInScope(dmName: string | null | undefined, scope: DmOperatingSystemScope): boolean {
  if (!scope.scopedToTerritory) return true;
  if (!dmName) return false;
  return dmName.trim().toLowerCase() === scope.dmName.trim().toLowerCase();
}
