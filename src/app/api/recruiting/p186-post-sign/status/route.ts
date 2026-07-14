import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  buildPostSignDashboard,
  readP1865Flags,
  toP1865ProductRole,
  P186_5_SOURCE_PHASE,
} from "@/lib/p186-5-post-sign-mel-queue";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/recruiting/p186-post-sign/status";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "p186_post_sign_status",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const flags = readP1865Flags();
  if (!flags.postSignHealthDashboard && !flags.postSignObserver) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      sourcePhase: P186_5_SOURCE_PHASE,
      message: "P186.5 post-sign dashboard flags are off",
      flags,
    });
  }

  const role = toP1865ProductRole(guard.session.role, true);
  // Live cohort wiring can be added later; empty cohort keeps read-only/idle-safe.
  const dashboard = await buildPostSignDashboard({
    role,
    cohort: [],
    forceFlags: flags,
  });

  return NextResponse.json({
    ok: true,
    enabled: true,
    dashboard,
    safety: dashboard.safety,
  });
}
