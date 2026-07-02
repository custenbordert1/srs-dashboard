import { guardApiRoute, isGuardFailure } from "@/lib/auth/api-guard";
import { startScheduler } from "@/lib/p136-autonomous-paperwork-scheduler";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guard = guardApiRoute(request, { allowedRoles: ["executive"], auditAction: "recruiting_intelligence" });
  if (isGuardFailure(guard)) return guard;

  let intervalMs: number | undefined;
  let oneCycle = false;
  try {
    const body = (await request.json()) as { intervalMs?: number; oneCycle?: boolean };
    intervalMs = body.intervalMs;
    oneCycle = body.oneCycle === true;
  } catch {
    // defaults
  }

  const state = await startScheduler({ intervalMs, mode: oneCycle ? "oneCycle" : "continuous" });

  return NextResponse.json({
    ok: true,
    schedulerStatus: state.schedulerStatus,
    schedulerMode: state.schedulerMode,
    continuousEnabled: state.continuousEnabled,
    scheduleIntervalMs: state.scheduleIntervalMs,
    nextScheduledCycleAt: state.nextScheduledCycleAt,
    warnings: [oneCycle ? "One-cycle mode armed." : "Continuous mode enabled — use run-once or CLI for ticks."],
  });
}
