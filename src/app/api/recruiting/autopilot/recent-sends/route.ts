import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildP155RecentSends } from "@/lib/p155-autopilot-operations-dashboard";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ROUTE = "/api/recruiting/autopilot/recent-sends";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_autopilot_recent_sends",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "25", 10);
  const sends = await buildP155RecentSends({
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 25,
  });

  return NextResponse.json({ ok: true, sends, count: sends.length });
}
