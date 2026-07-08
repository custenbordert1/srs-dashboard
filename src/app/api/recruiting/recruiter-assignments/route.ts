import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { emptyP158Dashboard } from "@/lib/app-loading-reliability/api-fallbacks";
import { buildSafeApiResponse } from "@/lib/app-loading-reliability/safe-api-response";
import { P161_SERVER_HEAVY_TIMEOUT_MS } from "@/lib/app-loading-reliability/constants";
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

  const safe = await buildSafeApiResponse({
    label: "Recruiter assignments",
    timeoutMs: P161_SERVER_HEAVY_TIMEOUT_MS,
    build: async () => {
      const dashboard = await buildAssignmentDashboard();
      return { dashboard, warnings: dashboard.warnings };
    },
    fallback: () => ({
      dashboard: emptyP158Dashboard(),
      warnings: ["Degraded empty assignment dashboard"],
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
