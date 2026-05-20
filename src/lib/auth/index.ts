export { getServerSession, getSessionFromRequest } from "@/lib/auth/request-session";
export { guardApiRoute, requireSession, auditTerritoryAccess, isGuardFailure } from "@/lib/auth/api-guard";
export {
  canAccessRoute,
  canAccessTerritory,
  filterStatesForSession,
  assertTerritoryAccess,
} from "@/lib/auth/permissions";
export {
  matchesProtectedApi,
  pagePolicyForPath,
  roleAllowedOnPage,
} from "@/lib/auth/route-access";
export type { AuthSession, UserPublic, UserRole } from "@/lib/auth/types";
