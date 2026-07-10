import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { serveExecutiveSnapshot } from "@/lib/app-performance/serve-snapshot";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/operations-control-center";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_operations_control_center",
  });
  if (isGuardFailure(guard)) return guard;
  const { session } = guard;
  auditTerritoryAccess(session, ROUTE);

  const { snapshot, meta } = await serveExecutiveSnapshot();

  return NextResponse.json({
    ok: true,
    dashboard: snapshot.operations,
    warnings: snapshot.warnings,
    meta,
  });
}
