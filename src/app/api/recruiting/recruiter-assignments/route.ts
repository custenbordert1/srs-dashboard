import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildAssignmentDashboard } from "@/lib/p158-autonomous-recruiter-assignment";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/recruiter-assignments";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_recruiter_assignments",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const dashboard = await buildAssignmentDashboard();

  return NextResponse.json({
    ok: true,
    dashboard,
    warnings: dashboard.warnings,
  });
}
