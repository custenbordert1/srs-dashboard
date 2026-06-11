import { getSessionFromRequest } from "@/lib/auth/request-session";
import { refreshSessionTerritories } from "@/lib/auth/session-territories";
import type { AuthSession, UserRole } from "@/lib/auth/types";
import { auditFromSession, territoryLabel } from "@/lib/security/audit-log";
import {
  apiRoutePolicy,
  hasTerritoryAssignment,
} from "@/lib/security/permissions";
import { checkRateLimit, clientIpFromRequest } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export type ApiGuardSuccess = {
  session: AuthSession;
};

export type ApiGuardFailure = NextResponse;

export function unauthorizedJson(message = "Unauthorized"): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status: 401 });
}

export function forbiddenJson(message = "Forbidden"): NextResponse {
  return NextResponse.json({ ok: false, error: message }, { status: 403 });
}

export function requireSession(request: Request): AuthSession | ApiGuardFailure {
  const session = getSessionFromRequest(request);
  if (!session) return unauthorizedJson();
  return session;
}

export function requireRoles(session: AuthSession, roles: UserRole[]): AuthSession | ApiGuardFailure {
  if (!roles.includes(session.role)) {
    return forbiddenJson(`${ROLE_LABEL(session.role)} cannot access this resource`);
  }
  return session;
}

function ROLE_LABEL(role: UserRole): string {
  return role;
}

export function requireTerritory(session: AuthSession): AuthSession | ApiGuardFailure {
  if (!hasTerritoryAssignment(session)) {
    return forbiddenJson("DM has no assigned territory");
  }
  return session;
}

export function guardApiRoute(
  request: Request,
  options?: {
    allowedRoles?: UserRole[];
    requireTerritory?: boolean;
    rateLimit?: { limit: number; windowMs: number };
    auditAction?: string;
  },
): ApiGuardSuccess | ApiGuardFailure {
  const pathname = new URL(request.url).pathname;
  const policy = apiRoutePolicy(pathname);

  if (options?.rateLimit) {
    const ip = clientIpFromRequest(request);
    const key = `${pathname}:${ip}`;
    const limited = checkRateLimit(key, options.rateLimit);
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many requests. Try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) },
        },
      );
    }
  }

  const sessionResult = requireSession(request);
  if (sessionResult instanceof NextResponse) return sessionResult;
  const session = refreshSessionTerritories(sessionResult);

  const roles = options?.allowedRoles ?? policy.allowedRoles;
  if (roles) {
    const roleResult = requireRoles(session, roles);
    if (roleResult instanceof NextResponse) return roleResult;
  }

  if (options?.requireTerritory ?? policy.requiresTerritory) {
    const territoryResult = requireTerritory(session);
    if (territoryResult instanceof NextResponse) return territoryResult;
  }

  if (options?.auditAction) {
    auditFromSession(session, {
      action: "api_access",
      entityType: "api",
      entityId: pathname,
      metadata: { method: request.method, auditAction: options.auditAction },
    });
  }

  return { session };
}

export function auditTerritoryAccess(session: AuthSession, pathname: string): void {
  auditFromSession(session, {
    action: "territory_access",
    entityType: "territory",
    entityId: territoryLabel(session),
    metadata: { path: pathname },
  });
}

export function isGuardFailure(result: AuthSession | ApiGuardSuccess | ApiGuardFailure): result is ApiGuardFailure {
  return result instanceof NextResponse;
}
