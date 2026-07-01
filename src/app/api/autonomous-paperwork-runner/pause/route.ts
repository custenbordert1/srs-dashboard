import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { pauseProductionRunner } from "@/lib/p125-autonomous-paperwork-production-runner";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/autonomous-paperwork-runner/pause
 */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  const state = await pauseProductionRunner();

  return NextResponse.json({
    ok: true,
    runnerStatus: state.runnerStatus,
    schedulerMode: state.schedulerMode,
  });
}
