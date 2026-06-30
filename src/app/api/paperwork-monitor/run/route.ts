import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { runPaperworkMonitorCycle } from "@/lib/paperwork-monitor";
import type { PaperworkMonitorMode } from "@/lib/paperwork-monitor";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** POST /api/paperwork-monitor/run */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  let mode: PaperworkMonitorMode = "runOnce";
  try {
    const body = (await request.json()) as { mode?: PaperworkMonitorMode };
    if (body.mode === "dryRun" || body.mode === "runOnce" || body.mode === "scheduled") {
      mode = body.mode;
    }
  } catch {
    // default runOnce
  }

  const result = await runPaperworkMonitorCycle({
    mode,
    byUserId: guard.session.userId,
  });

  return NextResponse.json({
    ok: result.ok,
    skippedOverlap: result.skippedOverlap,
    paperworkMonitor: result.report,
    warnings: result.warnings,
  });
}
