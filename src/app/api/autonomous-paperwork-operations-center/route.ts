import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildAutonomousPaperworkOperationsCenterReport } from "@/lib/p118-autonomous-paperwork-operations-center";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/autonomous-paperwork-operations-center
 * Read-only operations visibility snapshot.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const report = await buildAutonomousPaperworkOperationsCenterReport();

  return NextResponse.json({
    ok: true,
    autonomousPaperworkOperationsCenter: report,
    warnings: report.warnings,
  });
}
