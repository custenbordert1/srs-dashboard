import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  buildExecutiveDashboard,
  readP1866Flags,
  toP1866ProductRole,
  P186_6_SOURCE_PHASE,
  type P1866DateRangeKey,
} from "@/lib/p186-6-executive-recruiting-intelligence";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROUTE = "/api/recruiting/p186-executive/status";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "p186_executive_status",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const flags = readP1866Flags();
  if (!flags.executiveDashboard) {
    return NextResponse.json({
      ok: true,
      enabled: false,
      sourcePhase: P186_6_SOURCE_PHASE,
      message: "P186_EXECUTIVE_DASHBOARD flag is off",
      flags,
    });
  }

  const url = new URL(request.url);
  const role = toP1866ProductRole(guard.session.role, url.searchParams.get("asOperator") === "1");
  const dateRangeKey = (url.searchParams.get("range") as P1866DateRangeKey) || "last_7_days";
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "50");

  // Live cohort wiring deferred — empty cohort keeps degraded-safe read-only response.
  const dashboard = buildExecutiveDashboard({
    role,
    cohort: [],
    dateRangeKey,
    page,
    pageSize,
    selfName: guard.session.name,
    forceFlags: flags,
    systemHealthInput: {
      storageHealth: "unknown",
      schemaHealth: "ok",
    },
  });

  return NextResponse.json({
    ok: true,
    enabled: true,
    dashboard,
    safety: dashboard.safety,
  });
}
