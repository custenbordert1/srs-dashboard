import {
  P169_DEFAULT_CYCLE_INTERVAL_MS,
  P169_DEFAULT_MAX_RETRIES,
  P169_DEFAULT_MAX_SENDS_PER_CYCLE,
  P169_DEFAULT_MIN_CONFIDENCE,
  P169_DEFAULT_READINESS_THRESHOLD,
  type P169OrchestratorConfig,
} from "@/lib/p169-autonomous-recruiting-orchestrator/types";

export function isP169OrchestratorEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.P169_ORCHESTRATOR_ENABLED === "true";
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

export function resolveP169EnvConfig(env: NodeJS.ProcessEnv = process.env): P169OrchestratorConfig {
  const intervalMinutes = parsePositiveInt(env.P169_CYCLE_INTERVAL_MINUTES, 0);
  const cycleIntervalMs =
    intervalMinutes > 0 ? intervalMinutes * 60_000 : P169_DEFAULT_CYCLE_INTERVAL_MS;

  return {
    enabled: isP169OrchestratorEnabled(env),
    paused: env.P169_ORCHESTRATOR_PAUSED === "true",
    cycleIntervalMs,
    maxSendsPerCycle: parsePositiveInt(
      env.P169_MAX_SENDS_PER_CYCLE,
      P169_DEFAULT_MAX_SENDS_PER_CYCLE,
    ),
    dropboxBudgetReserve: parsePositiveInt(env.P169_DROPBOX_BUDGET_RESERVE, 5),
    minimumConfidence: parsePositiveInt(env.P169_MIN_CONFIDENCE, P169_DEFAULT_MIN_CONFIDENCE),
    maximumRetries: parsePositiveInt(env.P169_MAX_RETRIES, P169_DEFAULT_MAX_RETRIES),
    exceptionThreshold: parsePositiveInt(env.P169_EXCEPTION_THRESHOLD, 25),
    readinessThreshold: parsePositiveInt(
      env.P169_READINESS_THRESHOLD,
      P169_DEFAULT_READINESS_THRESHOLD,
    ),
    maintenanceWindows: [],
    pauseSchedule: { pausedUntil: null, reason: null },
    updatedAt: new Date().toISOString(),
  };
}

export function mergeP169Config(
  persisted: Partial<P169OrchestratorConfig> | null,
  env: NodeJS.ProcessEnv = process.env,
): P169OrchestratorConfig {
  const fromEnv = resolveP169EnvConfig(env);
  if (!persisted) return fromEnv;

  return {
    ...fromEnv,
    ...persisted,
    enabled: fromEnv.enabled,
    pauseSchedule: persisted.pauseSchedule ?? fromEnv.pauseSchedule,
    maintenanceWindows: persisted.maintenanceWindows ?? fromEnv.maintenanceWindows,
    updatedAt: persisted.updatedAt ?? fromEnv.updatedAt,
  };
}

export function isWithinMaintenanceWindow(
  config: P169OrchestratorConfig,
  now = new Date(),
): boolean {
  if (config.maintenanceWindows.length === 0) return false;
  const day = now.toISOString().slice(0, 10);
  for (const window of config.maintenanceWindows) {
    const start = Date.parse(`${day}T${window.start}`);
    const end = Date.parse(`${day}T${window.end}`);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const ms = now.getTime();
    if (ms >= start && ms <= end) return true;
  }
  return false;
}

export function isPauseScheduleActive(
  config: P169OrchestratorConfig,
  now = Date.now(),
): string | null {
  if (config.paused) return config.pauseSchedule.reason ?? "Orchestrator paused by administrator";
  const until = config.pauseSchedule.pausedUntil;
  if (until && Date.parse(until) > now) {
    return config.pauseSchedule.reason ?? "Scheduled pause active";
  }
  return null;
}
