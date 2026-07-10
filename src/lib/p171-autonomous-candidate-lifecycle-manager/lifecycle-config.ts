import {
  P171_DEFAULT_CYCLE_INTERVAL_MS,
  P171_DEFAULT_MAX_REMINDERS,
  P171_DEFAULT_MAX_RETRIES,
  P171_DEFAULT_MIN_CONFIDENCE,
  P171_DEFAULT_REMINDER_HOURS,
  type P171LifecycleConfig,
} from "@/lib/p171-autonomous-candidate-lifecycle-manager/types";

export function isP171LifecycleEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.P171_LIFECYCLE_ENABLED === "true";
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function parseReminderHours(env: NodeJS.ProcessEnv): number[] {
  const raw = env.P171_REMINDER_HOURS?.trim();
  if (!raw) return [...P171_DEFAULT_REMINDER_HOURS];
  const parsed = raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return parsed.length > 0 ? parsed : [...P171_DEFAULT_REMINDER_HOURS];
}

export function resolveP171EnvConfig(env: NodeJS.ProcessEnv = process.env): P171LifecycleConfig {
  const intervalMinutes = parsePositiveInt(env.P171_CYCLE_INTERVAL_MINUTES, 0);
  const cycleIntervalMs =
    intervalMinutes > 0 ? intervalMinutes * 60_000 : P171_DEFAULT_CYCLE_INTERVAL_MS;

  return {
    enabled: isP171LifecycleEnabled(env),
    paused: env.P171_LIFECYCLE_PAUSED === "true",
    cycleIntervalMs,
    minimumConfidence: parsePositiveInt(env.P171_MIN_CONFIDENCE, P171_DEFAULT_MIN_CONFIDENCE),
    maximumRetries: parsePositiveInt(env.P171_MAX_RETRIES, P171_DEFAULT_MAX_RETRIES),
    exceptionThreshold: parsePositiveInt(env.P171_EXCEPTION_THRESHOLD, 25),
    maxRemindersPerCandidate: parsePositiveInt(
      env.P171_MAX_REMINDERS_PER_CANDIDATE,
      P171_DEFAULT_MAX_REMINDERS,
    ),
    reminderHours: parseReminderHours(env),
    readinessThreshold: parsePositiveInt(env.P171_READINESS_THRESHOLD, 80),
    pauseSchedule: { pausedUntil: null, reason: null },
    updatedAt: new Date().toISOString(),
  };
}

export function mergeP171Config(
  persisted: Partial<P171LifecycleConfig> | null,
  env: NodeJS.ProcessEnv = process.env,
): P171LifecycleConfig {
  const fromEnv = resolveP171EnvConfig(env);
  if (!persisted) return fromEnv;

  return {
    ...fromEnv,
    ...persisted,
    enabled: fromEnv.enabled,
    pauseSchedule: persisted.pauseSchedule ?? fromEnv.pauseSchedule,
    reminderHours: persisted.reminderHours?.length ? persisted.reminderHours : fromEnv.reminderHours,
    updatedAt: persisted.updatedAt ?? fromEnv.updatedAt,
  };
}

export function isP171PauseActive(
  config: P171LifecycleConfig,
  now = Date.now(),
): string | null {
  if (config.paused) return config.pauseSchedule.reason ?? "Lifecycle manager paused by administrator";
  const until = config.pauseSchedule.pausedUntil;
  if (until && Date.parse(until) > now) {
    return config.pauseSchedule.reason ?? "Scheduled pause active";
  }
  return null;
}
