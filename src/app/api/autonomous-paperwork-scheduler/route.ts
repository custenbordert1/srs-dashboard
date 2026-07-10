import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { buildAutonomousPaperworkSchedulerReport } from "@/lib/p136-autonomous-paperwork-scheduler";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/autonomous-paperwork-scheduler
 * P136 scheduler status and executive panel.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const report = await buildAutonomousPaperworkSchedulerReport();

  return NextResponse.json({
    ok: true,
    previewOnly: true,
    scheduler: report,
    executivePanel: report.executivePanel,
    state: report.state,
    executeBatchCalled: false,
    breezyWrites: false,
    warnings: [
      "P136 — preview-only operations scheduler.",
      "Orchestrates P123/P124/P125/P134/P135 without changing execution logic.",
      "No Breezy writes, no paperwork sends, no executeBatch.",
    ],
  });
}
