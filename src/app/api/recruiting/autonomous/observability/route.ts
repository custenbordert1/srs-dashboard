import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { searchObservabilityHistory } from "@/lib/p149-autonomous-recruiting-production-readiness";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/recruiting/autonomous/observability";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_autonomous_observability_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, ROUTE);

  const url = new URL(request.url);
  const query = url.searchParams.get("q");
  const type = url.searchParams.get("type");
  const limit = Number(url.searchParams.get("limit")) || 50;

  const result = await searchObservabilityHistory({ query, type, limit });

  return NextResponse.json(
    { ok: true, ...result },
    { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=30" } },
  );
}
