import {
  canAccessRoute,
  canAccessTerritory,
  filterStatesForSession,
} from "@/lib/auth/permissions";
import { isAdminRole, isRecruiterRole } from "@/lib/auth/roles";
import type { AuthSession, UserRole } from "@/lib/auth/types";

export { canAccessRoute, canAccessTerritory, filterStatesForSession };

const RECRUITER_OPS_ROLES: UserRole[] = ["admin", "executive", "recruiter"];

function isBreezyDiagnosticsPath(pathname: string): boolean {
  return (
    pathname.includes("/debug") ||
    pathname.includes("/probe") ||
    pathname.includes("/health")
  );
}

export function canAccessExecutiveApi(session: AuthSession): boolean {
  return isAdminRole(session.role);
}

export function canAccessDmApi(session: AuthSession): boolean {
  return session.role === "dm" || isAdminRole(session.role);
}

export function canAccessRecruitingApi(session: AuthSession): boolean {
  return isAdminRole(session.role) || isRecruiterRole(session.role);
}

export function canAccessCandidatesApi(session: AuthSession): boolean {
  return canAccessRecruitingApi(session) || session.role === "dm";
}

export function hasTerritoryAssignment(session: AuthSession): boolean {
  if (session.role !== "dm") return true;
  return session.territoryStates.length > 0;
}

export function canAccessExecutivePage(role: UserRole): boolean {
  return isAdminRole(role);
}

export function canAccessDmPage(role: UserRole): boolean {
  return role === "dm" || isAdminRole(role);
}

export function apiRoutePolicy(pathname: string): {
  requiresAuth: boolean;
  allowedRoles?: UserRole[];
  requiresTerritory?: boolean;
} {
  if (pathname.startsWith("/api/executive") || pathname.startsWith("/api/health")) {
    return { requiresAuth: true, allowedRoles: ["admin", "executive"], requiresTerritory: false };
  }
  if (pathname.startsWith("/api/dm")) {
    return { requiresAuth: true, allowedRoles: ["dm", "admin", "executive"], requiresTerritory: true };
  }
  if (pathname.startsWith("/api/job-management")) {
    return { requiresAuth: true, allowedRoles: RECRUITER_OPS_ROLES, requiresTerritory: false };
  }
  if (
    pathname.startsWith("/api/onboarding/send-packet") ||
    pathname.startsWith("/api/onboarding/direct-deposit") ||
    pathname.startsWith("/api/onboarding/config")
  ) {
    return { requiresAuth: true, allowedRoles: RECRUITER_OPS_ROLES, requiresTerritory: false };
  }
  if (pathname.startsWith("/api/onboarding/status")) {
    return {
      requiresAuth: true,
      allowedRoles: [...RECRUITER_OPS_ROLES, "dm"],
      requiresTerritory: true,
    };
  }
  if (pathname.startsWith("/api/workforce-intelligence") || pathname.startsWith("/api/reps")) {
    return { requiresAuth: true, allowedRoles: RECRUITER_OPS_ROLES, requiresTerritory: false };
  }
  if (pathname.startsWith("/api/rep-intelligence")) {
    return { requiresAuth: true, allowedRoles: RECRUITER_OPS_ROLES, requiresTerritory: false };
  }
  if (isBreezyDiagnosticsPath(pathname)) {
    return { requiresAuth: true, allowedRoles: RECRUITER_OPS_ROLES, requiresTerritory: false };
  }
  if (pathname.startsWith("/api/recruiting")) {
    return {
      requiresAuth: true,
      allowedRoles: RECRUITER_OPS_ROLES,
      requiresTerritory: false,
    };
  }
  if (pathname.startsWith("/api/candidates")) {
    return {
      requiresAuth: true,
      allowedRoles: [...RECRUITER_OPS_ROLES, "dm"],
      requiresTerritory: true,
    };
  }
  if (pathname.startsWith("/api/breezy/jobs")) {
    return { requiresAuth: true, allowedRoles: RECRUITER_OPS_ROLES, requiresTerritory: false };
  }
  if (pathname.startsWith("/api/breezy")) {
    return {
      requiresAuth: true,
      allowedRoles: [...RECRUITER_OPS_ROLES, "dm"],
      requiresTerritory: true,
    };
  }
  if (pathname.startsWith("/api/mel-projects") || pathname.startsWith("/api/coverage-risk")) {
    return {
      requiresAuth: true,
      allowedRoles: [...RECRUITER_OPS_ROLES, "dm"],
      requiresTerritory: true,
    };
  }
  return { requiresAuth: true };
}
