export {
  DM_TERRITORY_ASSIGNMENTS,
  DM_PORTAL_DISTRICT_MANAGERS,
  type DmTerritoryAssignmentName,
} from "@/lib/dm-portal/dm-territory-assignments";
export {
  PORTAL_ROLES,
  PORTAL_ROLE_KEYS,
  type PortalRole,
  type PortalRoleKey,
  type DistrictManagerRoleAlias,
  toPortalRole,
  toPortalRoleKey,
  isDistrictManagerPortalRole,
  isPortalAdminRole,
  isPortalRecruiterRole,
} from "@/lib/dm-portal/roles";
export {
  type DmViewModeInput,
  type DmViewModeState,
  type DmViewVisibility,
  isDmViewModeEnabled,
  resolveDmViewModeFromUser,
  getDmViewVisibility,
} from "@/lib/dm-portal/dm-view-mode";
export {
  type TerritoryScopedRow,
  normalizeTerritoryStateList,
  isStateInTerritory,
  filterByTerritoryStates,
  filterByTerritoryStatesWith,
  excludeOtherDmTerritories,
  resolveTerritoryStatesForDm,
  territoryOwnerForState,
} from "@/lib/dm-portal/territory-filter-service";
export { buildDmPortalCardMetrics, type DmPortalCardMetrics } from "@/lib/dm-portal/dm-portal-metrics";
