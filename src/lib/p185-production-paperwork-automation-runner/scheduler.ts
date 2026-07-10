import { runP185ProductionPaperworkAutomation } from "@/lib/p185-production-paperwork-automation-runner/runner";
import type { P185RunOptions, P185RunResult } from "@/lib/p185-production-paperwork-automation-runner/runner";
import {
  loadP185RunnerState,
  saveP185RunnerState,
} from "@/lib/p185-production-paperwork-automation-runner/durableStorage";
import { isP185SchedulerAuthConfigured } from "@/lib/p185-production-paperwork-automation-runner/health";

export const P185_DEFAULT_CRON_EXPRESSION = "*/10 * * * *";
export const P185_DEFAULT_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Authenticate scheduled requests (Vercel Cron or company cron).
 * Never trusts mode/enabled from the request body.
 */
export function authenticateP185CronRequest(request: Request): {
  ok: boolean;
  status: number;
  error?: string;
} {
  if (!isP185SchedulerAuthConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "Scheduler authentication is not configured (CRON_SECRET / P185_CRON_SECRET).",
    };
  }
  const expected =
    process.env.P185_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim() || "";
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = request.headers.get("x-cron-secret")?.trim() ?? "";
  const url = new URL(request.url);
  // Query secrets are rejected — only header auth.
  if (url.searchParams.has("secret") || url.searchParams.has("cron_secret")) {
    return { ok: false, status: 401, error: "Query-string secrets are not accepted." };
  }
  if (bearer === expected || headerSecret === expected) {
    return { ok: true, status: 200 };
  }
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET> when configured.
  return { ok: false, status: 401, error: "Unauthorized scheduled request." };
}

export type P185SchedulerConfig = {
  expression: string;
  intervalMs: number;
  maxSendsPerCycle: number;
  path: string;
};

export function getP185SchedulerConfig(): P185SchedulerConfig {
  return {
    expression: process.env.P185_CRON_EXPRESSION?.trim() || P185_DEFAULT_CRON_EXPRESSION,
    intervalMs: Number(process.env.P185_CRON_INTERVAL_MS) || P185_DEFAULT_INTERVAL_MS,
    maxSendsPerCycle: Number(process.env.P185_MAX_SENDS_PER_CYCLE) || 10,
    path: "/api/cron/p185-paperwork-automation",
  };
}

/**
 * Scheduled trigger entry — ignores request-supplied mode/enabled.
 */
export async function executeP185ScheduledCycle(input?: {
  nowMs?: number;
  deadlineMs?: number;
  maxCandidates?: number;
  maxSends?: number;
  deps?: P185RunOptions["deps"];
}): Promise<P185RunResult> {
  const state = await loadP185RunnerState();
  const sched = getP185SchedulerConfig();
  const nowMs = input?.nowMs ?? Date.now();
  const budget = state.safety.executionBudgetMs || 50_000;
  const result = await runP185ProductionPaperworkAutomation({
    intent: "scheduled",
    nowMs: input?.nowMs,
    deadlineMs: input?.deadlineMs ?? nowMs + budget,
    maxCandidates: input?.maxCandidates,
    maxSends: input?.maxSends ?? Math.min(sched.maxSendsPerCycle, state.safety.maxSendsPerCycle),
    deps: input?.deps,
  });
  const latest = await loadP185RunnerState();
  latest.nextScheduledRunAt = new Date(nowMs + sched.intervalMs).toISOString();
  await saveP185RunnerState(latest);
  return result;
}
