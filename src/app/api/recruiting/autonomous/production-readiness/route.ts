import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildAutonomousRecruitingProductionReadiness } from "@/lib/p149-autonomous-recruiting-production-readiness";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const ROUTE = "/api/recruiting/autonomous/production-readiness";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_autonomous_production_readiness_read",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, ROUTE);

  const url = new URL(request.url);
  const skipDryRun = url.searchParams.get("skipDryRun") === "true";

  const report = await buildAutonomousRecruitingProductionReadiness({
    session,
    skipLiveDryRun: skipDryRun,
  });

  return NextResponse.json(
    { ok: true, report },
    { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" } },
  );
}
