import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildSafeApiResponse } from "@/lib/app-loading-reliability/safe-api-response";
import { P161_SERVER_HEAVY_TIMEOUT_MS } from "@/lib/app-loading-reliability/constants";
import { buildP1682ExecutiveReadinessAdvisor } from "@/lib/p168.2-executive-readiness-advisor";
import { emptyP1682ReadinessAdvisorReport } from "@/lib/p168.2-executive-readiness-advisor/empty-report";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/executive-readiness";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_executive_readiness",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const safe = await buildSafeApiResponse({
    label: "Executive readiness advisor",
    timeoutMs: P161_SERVER_HEAVY_TIMEOUT_MS,
    build: async () => {
      const report = await buildP1682ExecutiveReadinessAdvisor({ persistSnapshot: true });
      return { report, warnings: report.warnings };
    },
    fallback: () => ({
      report: emptyP1682ReadinessAdvisorReport(),
      warnings: ["Degraded empty readiness advisor report"],
    }),
    mapWarnings: (p) => p.warnings,
  });

  return NextResponse.json({
    ok: true,
    report: safe.payload.report,
    warnings: safe.warnings,
    meta: safe.meta,
  });
}
