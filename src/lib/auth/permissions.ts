import { isAdminRole, isRecruiterRole } from "@/lib/auth/roles";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { AuthSession, UserRole } from "@/lib/auth/types";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  executive: "Admin",
  recruiter: "Recruiter",
  dm: "District Manager",
};

const ADMIN_ROUTE_PREFIXES = ["/", "/dm", "/executive", "/login", "/api", "/api/rep-intelligence"];

/** Routes each role may access (pages and APIs). */
const ROLE_ROUTE_PREFIXES: Record<UserRole, string[]> = {
  admin: ADMIN_ROUTE_PREFIXES,
  executive: ADMIN_ROUTE_PREFIXES,
  recruiter: [
    "/",
    "/dm",
    "/login",
    "/api",
    "/api/candidates",
    "/api/mel-projects",
    "/api/rep-intelligence",
  ],
  dm: [
    "/dm",
    "/login",
    "/api/auth",
    "/api/dm",
    "/api/breezy/candidates",
    "/api/mel-projects",
    "/api/coverage-risk",
    "/api/candidates/workflows",
    "/api/candidates",
    "/api/onboarding/status",
  ],
};

export function canAccessRoute(role: UserRole, pathname: string): boolean {
  const allowed = ROLE_ROUTE_PREFIXES[role];
  return allowed.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function canAccessTerritory(session: AuthSession, rawState: string): boolean {
  if (isAdminRole(session.role) || isRecruiterRole(session.role)) return true;
  const state = normalizeStateCode(rawState);
  if (!state) return false;
  return session.territoryStates.includes(state);
}

export function filterStatesForSession(session: AuthSession, requestedStates?: string[]): string[] | null {
  if (isAdminRole(session.role) || isRecruiterRole(session.role)) {
    if (!requestedStates || requestedStates.length === 0) return null;
    return requestedStates.map(normalizeStateCode).filter(Boolean);
  }
  return [...session.territoryStates];
}

export function assertTerritoryAccess(session: AuthSession, rawState: string): void {
  if (!canAccessTerritory(session, rawState)) {
    throw new Error("Forbidden: state outside assigned territory");
  }
}
