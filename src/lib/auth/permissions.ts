import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { AuthSession, UserRole } from "@/lib/auth/types";

export const ROLE_LABELS: Record<UserRole, string> = {
  executive: "Executive",
  recruiter: "Recruiter",
  dm: "District Manager",
};

/** Routes each role may access (pages and APIs). */
const ROLE_ROUTE_PREFIXES: Record<UserRole, string[]> = {
  executive: ["/", "/dm", "/executive", "/login", "/api", "/api/rep-intelligence"],
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
    "/api/breezy",
    "/api/recruiting",
    "/api/candidates",
    "/api/mel-projects",
    "/api/rep-intelligence",
  ],
};

export function canAccessRoute(role: UserRole, pathname: string): boolean {
  const allowed = ROLE_ROUTE_PREFIXES[role];
  return allowed.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function canAccessTerritory(session: AuthSession, rawState: string): boolean {
  if (session.role === "executive" || session.role === "recruiter") return true;
  const state = normalizeStateCode(rawState);
  if (!state) return false;
  return session.territoryStates.includes(state);
}

export function filterStatesForSession(session: AuthSession, requestedStates?: string[]): string[] | null {
  if (session.role === "executive" || session.role === "recruiter") {
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
