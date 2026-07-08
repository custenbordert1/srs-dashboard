import { auditTerritoryAccess, guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildSafeApiResponse } from "@/lib/app-loading-reliability/safe-api-response";
import { P161_SERVER_HEAVY_TIMEOUT_MS } from "@/lib/app-loading-reliability/constants";
import { buildP168ExecutiveApprovalReport } from "@/lib/p168-executive-approval/approval-engine";
import { emptyP168ExecutiveApprovalReport } from "@/lib/p168-executive-approval/empty-report";
import { BREEZY_RATE_LIMIT } from "@/lib/security/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROUTE = "/api/recruiting/executive-approval";

export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter", "dm"],
    requireTerritory: true,
    rateLimit: BREEZY_RATE_LIMIT,
    auditAction: "recruiting_executive_approval",
  });
  if (isGuardFailure(guard)) return guard;
  auditTerritoryAccess(guard.session, ROUTE);

  const safe = await buildSafeApiResponse({
    label: "Executive approval",
    timeoutMs: P161_SERVER_HEAVY_TIMEOUT_MS,
    build: async () => {
      const report = await buildP168ExecutiveApprovalReport();
      return { report, warnings: report.warnings };
    },
    fallback: () => ({
      report: emptyP168ExecutiveApprovalReport(),
      warnings: ["Degraded empty executive approval report"],
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
