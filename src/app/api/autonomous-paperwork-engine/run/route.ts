import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import {
  P106_DEFAULT_MODE,
  runAutonomousPaperworkEngine,
  type AutonomousPaperworkRunMode,
} from "@/lib/p106-autonomous-paperwork-engine";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function parseMode(value: string | null | undefined): AutonomousPaperworkRunMode {
  if (value === "executeOne" || value === "executeSafeSingles") return value;
  return P106_DEFAULT_MODE;
}

/**
 * POST /api/autonomous-paperwork-engine/run
 * Run autonomous paperwork engine (default dryRun).
 */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  let body: {
    mode?: AutonomousPaperworkRunMode;
    mtdOnly?: boolean;
    executiveApprovalFlag?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const mode = parseMode(body.mode);

  if (mode === "executeBatch" as string) {
    return NextResponse.json({ ok: false, error: "executeBatch is not supported in P106." }, { status: 400 });
  }

  try {
    const result = await runAutonomousPaperworkEngine({
      mode,
      mtdOnly: body.mtdOnly !== false,
      executiveApprovalFlag: body.executiveApprovalFlag ?? mode !== "dryRun",
      byUserId: guard.session.userId,
      approvedByUserId: guard.session.userId,
    });

    return NextResponse.json({
      ok: result.ok,
      mode: result.mode,
      stoppedEarly: result.stoppedEarly,
      stopReason: result.stopReason,
      sendsThisRun: result.sendsThisRun,
      autonomousPaperworkEngine: result.report,
      warnings: result.warnings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Autonomous paperwork engine failed.",
      },
      { status: 400 },
    );
  }
}
