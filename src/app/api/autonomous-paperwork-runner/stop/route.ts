import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { stopProductionRunner } from "@/lib/p125-autonomous-paperwork-production-runner";
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

  const state = await stopProductionRunner();

  return NextResponse.json({
    ok: true,
    runnerStatus: state.runnerStatus,
    schedulerMode: state.schedulerMode,
    continuousEnabled: state.continuousEnabled,
  });
}
