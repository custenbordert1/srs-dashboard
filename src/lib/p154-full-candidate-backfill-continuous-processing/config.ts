import {
  P1544_DEFAULT_BACKFILL_SINCE,
  P1544_DEFAULT_INTERVAL_MINUTES,
  P1544_DEFAULT_MAX_ASSIGNMENTS,
  P1544_DEFAULT_MAX_SENDS,
} from "@/lib/p154-full-candidate-backfill-continuous-processing/types";

export function isP154ContinuousEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.P154_CONTINUOUS_ENABLED === "true";
}

export function getP154IntervalMinutes(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.P154_INTERVAL_MINUTES ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : P1544_DEFAULT_INTERVAL_MINUTES;
}

export function getP154IntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  return getP154IntervalMinutes(env) * 60_000;
}

export function getP154BackfillSince(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.P154_BACKFILL_SINCE?.trim();
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : P1544_DEFAULT_BACKFILL_SINCE;
}

export function getP1544MaxAssignmentsPerCycle(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(
    env.P154_MAX_ASSIGNMENTS_PER_CYCLE ?? env.P154_MAX_RECRUITER_ASSIGNMENTS_PER_CYCLE ?? "",
    10,
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : P1544_DEFAULT_MAX_ASSIGNMENTS;
}

export function getP1544MaxSendsPerCycle(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(
    env.P154_MAX_PAPERWORK_SENDS_PER_CYCLE ?? "",
    10,
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : P1544_DEFAULT_MAX_SENDS;
}

export function applyP1544CycleEnvFlags(env: NodeJS.ProcessEnv, live: boolean): void {
  env.P154_MAX_RECRUITER_ASSIGNMENTS_PER_CYCLE = String(getP1544MaxAssignmentsPerCycle(env));
  env.P154_MAX_PAPERWORK_SENDS_PER_CYCLE = String(getP1544MaxSendsPerCycle(env));
  env.P151_MAX_ASSIGNMENTS_PER_CYCLE = String(getP1544MaxAssignmentsPerCycle(env));
  env.P152_MAX_SENDS_PER_CYCLE = String(getP1544MaxSendsPerCycle(env));
  if (live) {
    env.P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED = "true";
    env.P151_AUTONOMOUS_ADVANCEMENT_ENABLED = "true";
    env.P152_IMMEDIATE_PAPERWORK_ENABLED = "true";
  }
}
