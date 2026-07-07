import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildP155OperationsDashboard } from "@/lib/p155-autopilot-operations-dashboard";
import { buildP1547AutopilotStatus } from "@/lib/p154-continuous-autonomous-recruiting-runner";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/autopilot/status";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_autopilot_status",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const [runner, built] = await Promise.all([
    buildP1547AutopilotStatus(),
    buildP155OperationsDashboard(),
  ]);

  return NextResponse.json({
    ok: runner.ok,
    runner,
    dashboard: built.dashboard,
    warnings: built.warnings,
  });
}
