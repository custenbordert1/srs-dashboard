import type { UserRole } from "@/lib/auth/types";
import { isAdminRole, isDmRole, isRecruiterRole } from "@/lib/auth/roles";

/** Portal-facing role labels (typing only — auth still uses `UserRole`). */
export const PORTAL_ROLES = ["Admin", "Recruiter", "DistrictManager"] as const;
export type PortalRole = (typeof PORTAL_ROLES)[number];

/** Lowercase portal role keys for config and feature flags. */
export const PORTAL_ROLE_KEYS = ["admin", "recruiter", "district_manager"] as const;
export type PortalRoleKey = (typeof PORTAL_ROLE_KEYS)[number];

export type DistrictManagerRoleAlias = "dm" | "district_manager";

export function toPortalRole(role: UserRole): PortalRole {
  if (isAdminRole(role)) return "Admin";
  if (isRecruiterRole(role)) return "Recruiter";
  if (isDmRole(role)) return "DistrictManager";
  return "Recruiter";
}

export function toPortalRoleKey(role: UserRole): PortalRoleKey {
  if (isAdminRole(role)) return "admin";
  if (isRecruiterRole(role)) return "recruiter";
  if (isDmRole(role)) return "district_manager";
  return "recruiter";
}

export function isDistrictManagerPortalRole(
  role: UserRole | PortalRoleKey | DistrictManagerRoleAlias,
): boolean {
  if (role === "dm" || role === "district_manager") return true;
  return isDmRole(role as UserRole);
}

export function isPortalAdminRole(role: UserRole | PortalRoleKey): boolean {
  return role === "admin" || isAdminRole(role as UserRole);
}

export function isPortalRecruiterRole(role: UserRole | PortalRoleKey): boolean {
  return role === "recruiter" || isRecruiterRole(role as UserRole);
}
