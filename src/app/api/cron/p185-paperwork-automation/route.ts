import {
  authenticateP185CronRequest,
  executeP185ScheduledCycle,
} from "@/lib/p185-production-paperwork-automation-runner/scheduler";
import { buildP185HealthReport } from "@/lib/p185-production-paperwork-automation-runner/health";
import { loadP185RunnerState } from "@/lib/p185-production-paperwork-automation-runner/durableStorage";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
/** Soft platform budget — stop claiming work before Vercel/server timeout. */
export const maxDuration = 60;

/**
 * P185 scheduled production paperwork automation.
 * Compatible with Vercel Cron and company-hosted cron.
 * Never trusts mode/enabled from the request body.
 */
export async function GET(request: Request) {
  const auth = authenticateP185CronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("health") === "1") {
    const health = await buildP185HealthReport();
    return NextResponse.json({ ok: true, health });
  }

  const state = await loadP185RunnerState();
  const nowMs = Date.now();
  const deadlineMs = nowMs + (state.safety.executionBudgetMs || 50_000);
  const result = await executeP185ScheduledCycle({ nowMs, deadlineMs });
  return NextResponse.json({
    ok: true,
    skipped: result.skipped,
    skipReason: result.skipReason,
    cycle: result.cycle,
    mode: result.mode,
    lease: result.lease,
    storageDurable: result.storageDurable,
    reconciliation: result.reconciliation,
    p184: result.p184
      ? {
          evaluated: result.p184.evaluated,
          eligible: result.p184.eligible,
          sent: result.p184.sent,
          failed: result.p184.failed,
          retriesScheduled: result.p184.retriesScheduled,
          rateLimited: result.p184.rateLimited,
        }
      : null,
  });
}

export async function POST(request: Request) {
  const auth = authenticateP185CronRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  // Body may exist for ops tooling but mode/enabled are NEVER trusted.
  try {
    await request.json();
  } catch {
    // empty body is fine
  }

  const state = await loadP185RunnerState();
  const nowMs = Date.now();
  const deadlineMs = nowMs + (state.safety.executionBudgetMs || 50_000);
  const result = await executeP185ScheduledCycle({ nowMs, deadlineMs });

  return NextResponse.json({
    ok: true,
    skipped: result.skipped,
    skipReason: result.skipReason,
    cycle: result.cycle,
    mode: result.mode,
    lease: result.lease,
    storageDurable: result.storageDurable,
    healthHints: result.healthHints,
    reconciliation: result.reconciliation,
    p184: result.p184
      ? {
          evaluated: result.p184.evaluated,
          eligible: result.p184.eligible,
          sent: result.p184.sent,
          failed: result.p184.failed,
          retriesScheduled: result.p184.retriesScheduled,
          rateLimited: result.p184.rateLimited,
          durationMs: result.p184.durationMs,
        }
      : null,
  });
}
