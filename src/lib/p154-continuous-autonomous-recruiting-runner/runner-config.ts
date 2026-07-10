import {
  P1547_DEFAULT_BACKFILL_LOOKBACK_DAYS,
  P1547_DEFAULT_INTERVAL_MINUTES,
  P1547_DEFAULT_MAX_ASSIGNMENTS,
  P1547_DEFAULT_MAX_RUNTIME_MINUTES,
  P1547_DEFAULT_MAX_SENDS,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/types";

export function isP154ContinuousEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.P154_CONTINUOUS_ENABLED === "true";
}

export function getP154IntervalMinutes(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.P154_INTERVAL_MINUTES ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : P1547_DEFAULT_INTERVAL_MINUTES;
}

export function getP154IntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  return getP154IntervalMinutes(env) * 60_000;
}

export function getP154MaxAssignmentsPerCycle(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(
    env.P154_MAX_ASSIGNMENTS_PER_CYCLE ?? env.P154_MAX_RECRUITER_ASSIGNMENTS_PER_CYCLE ?? "",
    10,
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : P1547_DEFAULT_MAX_ASSIGNMENTS;
}

export function getP154MaxPaperworkSendsPerCycle(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.P154_MAX_PAPERWORK_SENDS_PER_CYCLE ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : P1547_DEFAULT_MAX_SENDS;
}

export function isP154StopOnError(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.P154_STOP_ON_ERROR !== "false";
}

export function getP154BackfillLookbackDays(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.P154_BACKFILL_LOOKBACK_DAYS ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : P1547_DEFAULT_BACKFILL_LOOKBACK_DAYS;
}

export function getP154MaxRuntimeMinutes(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.P154_MAX_RUNTIME_MINUTES ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : P1547_DEFAULT_MAX_RUNTIME_MINUTES;
}

export function getP154BackfillSinceDate(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.P154_BACKFILL_SINCE?.trim();
  if (explicit && /^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  const days = getP154BackfillLookbackDays(env);
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function applyP1547RunnerEnvFlags(env: NodeJS.ProcessEnv, live: boolean): void {
  env.P154_MAX_RECRUITER_ASSIGNMENTS_PER_CYCLE = String(getP154MaxAssignmentsPerCycle(env));
  env.P154_MAX_PAPERWORK_SENDS_PER_CYCLE = String(getP154MaxPaperworkSendsPerCycle(env));
  env.P151_MAX_ASSIGNMENTS_PER_CYCLE = String(getP154MaxAssignmentsPerCycle(env));
  env.P152_MAX_SENDS_PER_CYCLE = String(getP154MaxPaperworkSendsPerCycle(env));
  if (live) {
    env.P154_CONTROLLED_PRODUCTION_AUTOPILOT_ENABLED = "true";
    env.P151_AUTONOMOUS_ADVANCEMENT_ENABLED = "true";
    env.P152_IMMEDIATE_PAPERWORK_ENABLED = "true";
  } else {
    env.P152_IMMEDIATE_PAPERWORK_ENABLED = "false";
  }
}
