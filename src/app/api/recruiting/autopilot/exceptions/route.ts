import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildP155Exceptions } from "@/lib/p155-autopilot-operations-dashboard";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ROUTE = "/api/recruiting/autopilot/exceptions";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_autopilot_exceptions",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const { exceptions, warnings } = await buildP155Exceptions({
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 50,
  });

  return NextResponse.json({ ok: true, exceptions, count: exceptions.length, warnings });
}
