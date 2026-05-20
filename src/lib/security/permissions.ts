import { canAccessRoute, canAccessTerritory, filterStatesForSession } from "@/lib/auth/permissions";
import type { AuthSession, UserRole } from "@/lib/auth/types";

export { canAccessRoute, canAccessTerritory, filterStatesForSession };

export function canAccessExecutiveApi(session: AuthSession): boolean {
  return session.role === "executive";
}

export function canAccessDmApi(session: AuthSession): boolean {
  return session.role === "dm" || session.role === "executive" || session.role === "recruiter";
}

export function canAccessRecruitingApi(session: AuthSession): boolean {
  return session.role === "executive" || session.role === "recruiter" || session.role === "dm";
}

export function canAccessCandidatesApi(session: AuthSession): boolean {
  return canAccessRecruitingApi(session);
}

export function hasTerritoryAssignment(session: AuthSession): boolean {
  if (session.role !== "dm") return true;
  return session.territoryStates.length > 0;
}

export function canAccessExecutivePage(role: UserRole): boolean {
  return role === "executive";
}

export function canAccessDmPage(role: UserRole): boolean {
  return role === "dm" || role === "executive" || role === "recruiter";
}

export function apiRoutePolicy(pathname: string): {
  requiresAuth: boolean;
  allowedRoles?: UserRole[];
  requiresTerritory?: boolean;
} {
  if (pathname.startsWith("/api/executive")) {
    return { requiresAuth: true, allowedRoles: ["executive"], requiresTerritory: false };
  }
  if (pathname.startsWith("/api/dm")) {
    return { requiresAuth: true, allowedRoles: ["dm", "executive", "recruiter"], requiresTerritory: true };
  }
  if (pathname.startsWith("/api/recruiting")) {
    return {
      requiresAuth: true,
      allowedRoles: ["executive", "recruiter", "dm"],
      requiresTerritory: true,
    };
  }
  if (pathname.startsWith("/api/candidates")) {
    return {
      requiresAuth: true,
      allowedRoles: ["executive", "recruiter", "dm"],
      requiresTerritory: true,
    };
  }
  if (pathname.startsWith("/api/breezy")) {
    return {
      requiresAuth: true,
      allowedRoles: ["executive", "recruiter", "dm"],
      requiresTerritory: true,
    };
  }
  if (pathname.startsWith("/api/mel-projects")) {
    return {
      requiresAuth: true,
      allowedRoles: ["executive", "recruiter", "dm"],
      requiresTerritory: true,
    };
  }
  if (pathname.startsWith("/api/reps")) {
    return {
      requiresAuth: true,
      allowedRoles: ["executive", "recruiter", "dm"],
      requiresTerritory: true,
    };
  }
  if (pathname.startsWith("/api/rep-intelligence")) {
    return {
      requiresAuth: true,
      allowedRoles: ["executive", "recruiter", "dm"],
      requiresTerritory: true,
    };
  }
  return { requiresAuth: true };
}
