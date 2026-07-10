import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildSafeApiResponse } from "@/lib/app-loading-reliability/safe-api-response";
import { P161_SERVER_HEAVY_TIMEOUT_MS } from "@/lib/app-loading-reliability/constants";
import { buildP169ExceptionQueue } from "@/lib/p169-autonomous-recruiting-orchestrator";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/autonomous-orchestrator/exceptions";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_autonomous_orchestrator_exceptions",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const safe = await buildSafeApiResponse({
    label: "Autonomous orchestrator exceptions",
    timeoutMs: P161_SERVER_HEAVY_TIMEOUT_MS,
    build: async () => {
      const report = await buildP169ExceptionQueue();
      return { report, warnings: report.warnings };
    },
    fallback: () => ({
      report: {
        sourcePhase: "P169" as const,
        generatedAt: new Date().toISOString(),
        readOnly: true as const,
        totalExceptions: 0,
        byCategory: [],
        exceptions: [],
        lastCycleAt: null,
        warnings: ["Degraded empty exception queue"],
      },
      warnings: ["Degraded empty exception queue"],
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
