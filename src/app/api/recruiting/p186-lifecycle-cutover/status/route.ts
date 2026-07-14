import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  buildCutoverDashboard,
  readP1867Flags,
  P186_7_SOURCE_PHASE,
} from "@/lib/p186-7-lifecycle-cutover";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/recruiting/p186-lifecycle-cutover/status";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "p186_lifecycle_cutover_status",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const flags = readP1867Flags();
  if (!flags.cutoverDashboard) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      sourcePhase: P186_7_SOURCE_PHASE,
      message: "P186.7 cutover dashboard flag is off",
      flags,
      safety: {
        productionWritesAttempted: 0,
        paperworkSendsAttempted: 0,
        melWritesAttempted: 0,
        writersActuallyDisabled: 0,
        schedulerActivated: false,
        p186Authoritative: false,
      },
    });
  }

  const dashboard = buildCutoverDashboard({ forceFlags: { cutoverDashboard: true } });

  return NextResponse.json({
    ok: true,
    enabled: true,
    sourcePhase: P186_7_SOURCE_PHASE,
    readOnly: true,
    dashboard,
    safety: {
      productionWritesAttempted: 0,
      paperworkSendsAttempted: 0,
      melWritesAttempted: 0,
      writersActuallyDisabled: 0,
      schedulerActivated: false,
      p186Authoritative: false,
    },
  });
}
