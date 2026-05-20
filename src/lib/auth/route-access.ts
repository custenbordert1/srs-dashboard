import type { UserRole } from "@/lib/auth/types";

export type PageRoutePolicy = {
  prefix: string;
  roles: UserRole[];
  requireDmTerritory?: boolean;
};

export const PROTECTED_PAGE_ROUTES: PageRoutePolicy[] = [
  { prefix: "/executive", roles: ["executive"] },
  { prefix: "/dm", roles: ["dm", "executive", "recruiter"], requireDmTerritory: true },
];

export const PROTECTED_API_PREFIXES = [
  "/api/executive",
  "/api/dm",
  "/api/recruiting",
  "/api/candidates",
] as const;

export function matchesProtectedApi(pathname: string): boolean {
  return PROTECTED_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function pagePolicyForPath(pathname: string): PageRoutePolicy | null {
  for (const policy of PROTECTED_PAGE_ROUTES) {
    if (pathname === policy.prefix || pathname.startsWith(`${policy.prefix}/`)) {
      return policy;
    }
  }
  return null;
}

export function roleAllowedOnPage(role: UserRole, pathname: string): boolean {
  const policy = pagePolicyForPath(pathname);
  if (!policy) return true;
  return policy.roles.includes(role);
}
