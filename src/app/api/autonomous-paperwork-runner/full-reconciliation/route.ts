import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { runAutonomousPaperworkRunnerCycle } from "@/lib/autonomous-paperwork-runner";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/autonomous-paperwork-runner/full-reconciliation
 * Evaluate every Breezy candidate vs workflow store (dryRun).
 */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  let skipBreezySync = false;
  try {
    const body = (await request.json()) as { skipBreezySync?: boolean };
    if (body.skipBreezySync) skipBreezySync = true;
  } catch {
    // defaults
  }

  const result = await runAutonomousPaperworkRunnerCycle({
    mode: "fullReconciliation",
    mtdOnly: false,
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
