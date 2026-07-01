import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { runProductionRunnerCycle } from "@/lib/p125-autonomous-paperwork-production-runner";
import type { ProductionRunnerMode } from "@/lib/p125-autonomous-paperwork-production-runner";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/autonomous-paperwork-runner/run-once
 * Execute one P125 production cycle (dryRun unless live gates pass).
 */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  let mode: ProductionRunnerMode = "oneCycle";
  let execute: boolean | undefined;
  try {
    const body = (await request.json()) as { mode?: ProductionRunnerMode; execute?: boolean };
    if (body.mode) mode = body.mode;
    if (body.execute === true) execute = true;
    if (body.execute === false) execute = false;
  } catch {
    // defaults
  }

  const result = await runProductionRunnerCycle({
    mode,
    execute,
    byUserId: guard.session.userId,
  });

  return NextResponse.json({
    ok: result.ok,
    skippedOverlap: result.skippedOverlap,
    skippedPaused: result.skippedPaused,
    mode: result.mode,
    autonomousPaperworkRunner: result.snapshot,
    warnings: result.warnings,
    executeBatchCalled: false,
  });
}
