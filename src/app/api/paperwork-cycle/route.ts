import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { loadPaperworkCycleMonitorState, runPaperworkCycle } from "@/lib/autonomous-paperwork-orchestrator";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/paperwork-cycle
 * Live cycle monitor — preview by default; no sends.
 */
export async function GET(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive", "recruiter"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const url = new URL(request.url);
  const refresh = url.searchParams.get("refresh") === "true";
  const stored = await loadPaperworkCycleMonitorState();
  const report = refresh || !stored.currentCycle ? (await runPaperworkCycle({ dryRun: true })).report : stored.currentCycle;

  return NextResponse.json({
    ok: true,
    previewOnly: true,
    paperworkCycle: {
      currentCycle: report,
      currentCandidate: report.sendQueue.nextCandidate,
      currentStep: report.currentStep,
      progressPercent: report.progressPercent,
      queueDepth: report.sendQueue.queueDepth,
      errors: report.errors,
      warnings: report.warnings,
      etaMinutes: report.etaMinutes,
      lastExecution: report.lastExecutionAt,
      safetyState: report.safetyState,
      operatorTimeline: report.operatorTimeline,
    },
  });
}
