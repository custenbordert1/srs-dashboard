import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { runAutonomousPaperworkRunnerCycle } from "@/lib/autonomous-paperwork-runner";
import type { AutonomousPaperworkRunnerMode } from "@/lib/autonomous-paperwork-runner";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  let mode: AutonomousPaperworkRunnerMode = "dryRun";
  try {
    const body = (await request.json()) as { mode?: AutonomousPaperworkRunnerMode };
    if (body.mode) mode = body.mode === "runOnce" ? "runOnce" : "dryRun";
  } catch {
    // defaults
  }

  const result = await runAutonomousPaperworkRunnerCycle({
    mode,
    byUserId: guard.session.userId,
  });

  return NextResponse.json({
    ok: result.ok,
    skippedOverlap: result.skippedOverlap,
    autonomousPaperworkRunner: result.report,
    warnings: result.warnings,
  });
}
