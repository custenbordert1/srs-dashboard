import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { runAutonomousPaperworkRunnerCycle } from "@/lib/autonomous-paperwork-runner";
import type { AutonomousPaperworkRunnerMode } from "@/lib/autonomous-paperwork-runner";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/autonomous-paperwork-runner/run-once
 * Single incremental cycle (dryRun default).
 */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  let mode: AutonomousPaperworkRunnerMode = "dryRun";
  let mtdOnly = true;
  let skipBreezySync = false;
  try {
    const body = (await request.json()) as {
      mode?: AutonomousPaperworkRunnerMode;
      mtdOnly?: boolean;
      skipBreezySync?: boolean;
    };
    if (body.mode) mode = body.mode === "runOnce" ? "runOnce" : "dryRun";
    if (body.mtdOnly === false) mtdOnly = false;
    if (body.skipBreezySync) skipBreezySync = true;
  } catch {
    // defaults
  }

  const result = await runAutonomousPaperworkRunnerCycle({
    mode,
    mtdOnly,
    skipBreezySync,
    byUserId: guard.session.userId,
  });

  return NextResponse.json({
    ok: result.ok,
    skippedOverlap: result.skippedOverlap,
    mode: result.mode,
    autonomousPaperworkRunner: result.report,
    warnings: result.warnings,
  });
}
