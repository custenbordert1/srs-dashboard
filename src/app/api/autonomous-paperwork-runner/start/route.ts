import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { startProductionRunner } from "@/lib/p125-autonomous-paperwork-production-runner";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/autonomous-paperwork-runner/start
 * Start continuous P125 runner scheduling.
 */
export async function POST(request: Request) {
  const guard = guardApiRoute(request, {
    allowedRoles: ["executive"],
    auditAction: "recruiting_intelligence",
  });
  if (isGuardFailure(guard)) return guard;

  let intervalMs: number | undefined;
  let oneCycle = false;
  try {
    const body = (await request.json()) as { intervalMs?: number; oneCycle?: boolean };
    intervalMs = body.intervalMs;
    oneCycle = body.oneCycle === true;
  } catch {
    // no body
  }

  const state = await startProductionRunner({
    intervalMs,
    mode: oneCycle ? "oneCycle" : "continuous",
  });

  return NextResponse.json({
    ok: true,
    runnerStatus: state.runnerStatus,
    schedulerMode: state.schedulerMode,
    continuousEnabled: state.continuousEnabled,
    scheduleIntervalMs: state.scheduleIntervalMs,
    nextScheduledRunAt: state.nextScheduledRunAt,
    warnings: [
      oneCycle
        ? "One-cycle mode armed — run via run-once or CLI."
        : "Continuous mode enabled — use CLI script for interval ticks.",
    ],
  });
}
