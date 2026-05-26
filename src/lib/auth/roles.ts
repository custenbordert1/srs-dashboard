import type { UserRole } from "@/lib/auth/types";

/** Admin / executive full-access roles (executive kept for legacy stored users). */
export function isAdminRole(role: UserRole): boolean {
  return role === "admin" || role === "executive";
}

export function isRecruiterRole(role: UserRole): boolean {
  return role === "recruiter";
}

export function isDmRole(role: UserRole): boolean {
  return role === "dm";
}

/** Roles that use the full recruiter command center. */
export function canUseRecruiterCommandCenter(role: UserRole): boolean {
  return isAdminRole(role) || isRecruiterRole(role);
}

export function normalizeStoredRole(raw: string): UserRole {
  const value = raw.trim().toLowerCase();
  if (value === "admin") return "admin";
  if (value === "executive") return "executive";
  if (value === "recruiter") return "recruiter";
  if (value === "dm") return "dm";
  return "recruiter";
}
