import { canAccessRoute } from "@/lib/auth/permissions";
import { matchesProtectedApi, pagePolicyForPath, roleAllowedOnPage } from "@/lib/auth/route-access";
import { verifySessionTokenEdge } from "@/lib/auth/session-edge";
import { apiRoutePolicy, hasTerritoryAssignment } from "@/lib/security/permissions";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];
const PUBLIC_API_PREFIXES = ["/api/auth/login", "/api/auth/session"];

/** Dropbox Sign callbacks — no session; secured in route via event_hash (+ optional webhook secret). */
export const DROPBOX_SIGN_WEBHOOK_PATH = "/api/dropbox-sign/webhook";

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function isDropboxSignWebhookPath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  return path === DROPBOX_SIGN_WEBHOOK_PATH;
}

function isPublicPath(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (isDropboxSignWebhookPath(path)) return true;
  if (PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) return true;
  if (PUBLIC_API_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return true;
  }
  return false;
}

export async function proxy(request: NextRequest) {
  const pathname = normalizePathname(request.nextUrl.pathname);

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".png")
  ) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get("srs_session")?.value;
  const session = await verifySessionTokenEdge(token);

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!canAccessRoute(session.role, pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    const fallback = session.role === "dm" ? "/dm" : "/";
    return NextResponse.redirect(new URL(fallback, request.url));
  }

  if (!roleAllowedOnPage(session.role, pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    const fallback = session.role === "dm" ? "/dm" : "/";
    return NextResponse.redirect(new URL(fallback, request.url));
  }

  const pagePolicy = pagePolicyForPath(pathname);
  if (pagePolicy?.requireDmTerritory && session.role === "dm" && !hasTerritoryAssignment(session)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "DM has no assigned territory" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (matchesProtectedApi(pathname) || pathname.startsWith("/api/breezy") || pathname.startsWith("/api/mel-projects")) {
    const policy = apiRoutePolicy(pathname);
    if (policy.allowedRoles && !policy.allowedRoles.includes(session.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (policy.requiresTerritory && session.role === "dm" && !hasTerritoryAssignment(session)) {
      return NextResponse.json({ ok: false, error: "DM has no assigned territory" }, { status: 403 });
    }
  }

  if (session.role === "dm" && pathname === "/") {
    return NextResponse.redirect(new URL("/dm", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
