import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildProductionOperationsSnapshot } from "@/lib/p149-autonomous-recruiting-production-readiness";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/autonomous/operations";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_autonomous_operations_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, ROUTE);

  const snapshot = await buildProductionOperationsSnapshot(session);

  return NextResponse.json(
    { ok: true, snapshot },
    { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" } },
  );
}
