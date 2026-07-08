import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildSafeApiResponse } from "@/lib/app-loading-reliability/safe-api-response";
import { P161_SERVER_HEAVY_TIMEOUT_MS } from "@/lib/app-loading-reliability/constants";
import { buildP171ExceptionQueue } from "@/lib/p171-autonomous-candidate-lifecycle-manager";
import { P171_SOURCE_PHASE } from "@/lib/p171-autonomous-candidate-lifecycle-manager/types";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/lifecycle-manager/exceptions";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_lifecycle_manager_exceptions",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const safe = await buildSafeApiResponse({
    label: "Lifecycle exception queue",
    timeoutMs: P161_SERVER_HEAVY_TIMEOUT_MS,
    build: async () => {
      const report = await buildP171ExceptionQueue();
      return { report, warnings: report.warnings };
    },
    fallback: () => ({
      report: {
        sourcePhase: P171_SOURCE_PHASE,
        generatedAt: new Date().toISOString(),
        readOnly: true as const,
        totalExceptions: 0,
        byCategory: [],
        exceptions: [],
        lastCycleAt: null,
        warnings: ["Exception queue degraded"],
      },
      warnings: ["Exception queue degraded"],
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
