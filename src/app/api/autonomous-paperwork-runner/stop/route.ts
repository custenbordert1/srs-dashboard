import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { stopAutonomousPaperworkRunner } from "@/lib/autonomous-paperwork-runner";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/autonomous-paperwork-runner/stop
 */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const state = await stopAutonomousPaperworkRunner();

  return NextResponse.json({
    ok: true,
    runnerStatus: state.runnerStatus,
    scheduleEnabled: state.scheduleEnabled,
  });
}
