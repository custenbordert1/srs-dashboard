import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { startAutonomousPaperworkRunner } from "@/lib/autonomous-paperwork-runner";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/autonomous-paperwork-runner/start
 * Enable scheduled runner (interval from env or dev default).
 */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  let intervalMs: number | undefined;
  try {
    const body = (await request.json()) as { intervalMs?: number };
    intervalMs = body.intervalMs;
  } catch {
    // no body
  }

  const state = await startAutonomousPaperworkRunner({ intervalMs, explicit: true });

  return NextResponse.json({
    ok: true,
    runnerStatus: state.runnerStatus,
    scheduleEnabled: state.scheduleEnabled,
    scheduleIntervalMs: state.scheduleIntervalMs,
    warnings: ["Schedule enabled — use CLI script or external cron for interval ticks."],
  });
}
