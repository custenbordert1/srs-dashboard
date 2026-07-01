import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildAutonomousRecoveryReport } from "@/lib/p119-autonomous-recovery-engine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/autonomous-recovery
 * Read-only recovery intelligence snapshot.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const report = await buildAutonomousRecoveryReport();

  return NextResponse.json({
    ok: true,
    health: report.health,
    summary: report.summary,
    actions: report.actionQueue,
    recoveryCategories: report.recoveryDistribution,
    impactSimulation: report.impactSimulation,
    autonomousRecovery: report,
    warnings: report.warnings,
  });
}
