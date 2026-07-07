import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  buildDecisionDashboard,
  parseP157DecisionFilters,
} from "@/lib/p157-recruiter-decision-engine";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/recommended-actions";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_recommended_actions",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const filters = parseP157DecisionFilters(new URL(request.url));
  const dashboard = await buildDecisionDashboard(filters);

  return NextResponse.json({
    ok: true,
    dashboard,
    warnings: dashboard.warnings,
  });
}
