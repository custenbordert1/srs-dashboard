import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { emptyP157Dashboard } from "@/lib/app-loading-reliability/api-fallbacks";
import { buildSafeApiResponse } from "@/lib/app-loading-reliability/safe-api-response";
import { P161_SERVER_HEAVY_TIMEOUT_MS } from "@/lib/app-loading-reliability/constants";
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

  const safe = await buildSafeApiResponse({
    label: "Recommended actions",
    timeoutMs: P161_SERVER_HEAVY_TIMEOUT_MS,
    build: async () => {
      const dashboard = await buildDecisionDashboard(filters);
      return { dashboard, warnings: dashboard.warnings };
    },
    fallback: () => ({
      dashboard: emptyP157Dashboard(filters),
      warnings: ["Degraded empty decision dashboard"],
    }),
    mapWarnings: (p) => p.warnings,
  });

  return NextResponse.json({
    ok: true,
    dashboard: safe.payload.dashboard,
    warnings: safe.warnings,
    meta: safe.meta,
  });
}
