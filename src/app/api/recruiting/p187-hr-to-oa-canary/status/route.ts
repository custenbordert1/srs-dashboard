import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  buildArchitectureDocument,
  buildP187CutoverDashboard,
  P187_SOURCE_PHASE,
  readP187Flags,
} from "@/lib/p187-hr-to-oa-canary";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/recruiting/p187-hr-to-oa-canary/status";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "p187_hr_to_oa_canary_status",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const flags = readP187Flags();
  if (!flags.canaryDashboard) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      sourcePhase: P187_SOURCE_PHASE,
      message: "P187_CANARY_DASHBOARD flag is off",
      flags,
      safety: {
        paperworkSendsAttempted: 0,
        melExportsAttempted: 0,
        productionCanaryExecuted: false,
      },
    });
  }

  const dashboard = buildP187CutoverDashboard({
    forceFlags: { canaryDashboard: true },
    canaryStatus: "planned",
    rollbackReadiness: true,
  });
  const architecture = buildArchitectureDocument();

  return NextResponse.json({
    ok: true,
    enabled: true,
    sourcePhase: P187_SOURCE_PHASE,
    readOnly: true,
    dashboard,
    architecture,
    safety: {
      paperworkSendsAttempted: 0,
      dropboxSignChanges: 0,
      melExportsAttempted: 0,
      continuousAutomationEnabled: false,
      schedulerChanged: false,
      productionCanaryExecuted: false,
    },
  });
}
