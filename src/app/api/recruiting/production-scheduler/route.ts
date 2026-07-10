import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { emptyP167SchedulerReport } from "@/lib/p167-intelligent-production-scheduler/empty-report";
import { buildSafeApiResponse } from "@/lib/app-loading-reliability/safe-api-response";
import { P161_SERVER_HEAVY_TIMEOUT_MS } from "@/lib/app-loading-reliability/constants";
import { buildP167ProductionSchedulerReport } from "@/lib/p167-intelligent-production-scheduler";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/production-scheduler";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_production_scheduler",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const safe = await buildSafeApiResponse({
    label: "Production scheduler",
    timeoutMs: P161_SERVER_HEAVY_TIMEOUT_MS,
    build: async () => {
      const report = await buildP167ProductionSchedulerReport();
      return { report, warnings: report.warnings };
    },
    fallback: () => ({
      report: emptyP167SchedulerReport(),
      warnings: ["Degraded empty scheduler report"],
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
