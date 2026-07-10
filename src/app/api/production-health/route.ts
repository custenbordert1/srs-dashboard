import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildProductionHealthReport } from "@/lib/p140-production-rollout-health-monitoring";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/production-health
 * P140 — read-only production health and rollout monitoring.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const report = await buildProductionHealthReport();

  return NextResponse.json({
    ok: true,
    previewOnly: true,
    productionHealth: report,
    executivePanel: report.executivePanel,
    overallResult: report.overallResult,
    overallHealthScore: report.overallHealthScore,
    executeBatchCalled: false,
    breezyWrites: false,
    paperworkSent: false,
    warnings: [
      "P140 — read-only production health monitoring.",
      "No paperwork sends, no Breezy writes, no executeBatch.",
      report.activeAlerts.length > 0
        ? `${report.activeAlerts.length} active alert(s) — review recommendations.`
        : "No active alerts.",
    ],
  });
}
