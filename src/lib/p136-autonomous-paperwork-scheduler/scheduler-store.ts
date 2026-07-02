import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import {
  P136_DEFAULT_INTERVAL_MS,
  P136_SCHEDULER_VERSION,
  P136_STALE_HEARTBEAT_MS,
  P136_STALE_LOCK_MS,
  type SchedulerMode,
  type SchedulerPhase,
  type SchedulerState,
} from "@/lib/p136-autonomous-paperwork-scheduler/types";

function stateFilePath(): string {
  return path.join(recruitingDataDir(), "p136-autonomous-paperwork-scheduler-state.json");
}

export function schedulerAuditPath(): string {
  return path.join(recruitingDataDir(), "p136-autonomous-paperwork-scheduler-audit.jsonl");
}

function defaultState(): SchedulerState {
  const interval = Number(process.env.P136_SCHEDULER_INTERVAL_MS) || P136_DEFAULT_INTERVAL_MS;
  return {
    version: P136_SCHEDULER_VERSION,
    schedulerStatus: "stopped",
    schedulerMode: "stopped",
    continuousEnabled: false,
    scheduleIntervalMs: interval,
    startedAt: null,
    lastHeartbeatAt: null,
    lastCycleAt: null,
    lastSuccessfulCycleAt: null,
    nextScheduledCycleAt: null,
    processingLock: null,
    currentPhase: null,
    lastError: null,
    lastCycleDurationMs: null,
    averageCycleDurationMs: null,
    cycleCount: 0,
    lastCycleMetrics: null,
    uptimeStartedAt: null,
    executeBatchCalled: false,
    updatedAt: new Date().toISOString(),
  };
}

export async function loadSchedulerState(): Promise<SchedulerState> {
  try {
    const raw = await readFile(stateFilePath(), "utf8");
    const parsed = JSON.parse(raw) as SchedulerState;
    return { ...defaultState(), ...parsed, version: P136_SCHEDULER_VERSION, executeBatchCalled: false };
  } catch {
    return defaultState();
  }
}

export async function saveSchedulerState(state: SchedulerState): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
  state.updatedAt = new Date().toISOString();
  state.executeBatchCalled = false;
  await writeFile(stateFilePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function isSchedulerLockStale(lock: SchedulerState["processingLock"]): boolean {
  if (!lock) return true;
  return Date.now() - Date.parse(lock.lockedAt) > P136_STALE_LOCK_MS;
}

export function isSchedulerHeartbeatStale(state: SchedulerState): boolean {
  if (!state.lastHeartbeatAt) return true;
  return Date.now() - Date.parse(state.lastHeartbeatAt) > P136_STALE_HEARTBEAT_MS;
}

export async function touchSchedulerHeartbeat(phase?: SchedulerPhase | null): Promise<SchedulerState> {
  const state = await loadSchedulerState();
  state.lastHeartbeatAt = new Date().toISOString();
  if (phase !== undefined) state.currentPhase = phase;
  await saveSchedulerState(state);
  return state;
}

export async function tryAcquireSchedulerLock(input: {
  mode: SchedulerMode;
  phase?: SchedulerPhase;
}): Promise<{ acquired: boolean; runId: string; state: SchedulerState }> {
  const state = await loadSchedulerState();
  const runId = randomUUID();

  if (state.schedulerMode === "paused") {
    return { acquired: false, runId, state };
  }

  if (state.processingLock && !isSchedulerLockStale(state.processingLock)) {
    return { acquired: false, runId, state };
  }

  if (state.processingLock && isSchedulerLockStale(state.processingLock)) {
    state.lastError = "Recovered stale scheduler lock.";
    state.processingLock = null;
  }

  state.processingLock = {
    runId,
    lockedAt: new Date().toISOString(),
    mode: input.mode,
    currentPhase: input.phase ?? null,
  };
  state.schedulerStatus = "running";
  state.currentPhase = input.phase ?? null;
  state.lastCycleAt = new Date().toISOString();
  state.lastHeartbeatAt = new Date().toISOString();
  await saveSchedulerState(state);
  return { acquired: true, runId, state };
}

export async function releaseSchedulerLock(input: {
  runId: string;
  success: boolean;
  error?: string | null;
  durationMs: number;
  metrics?: SchedulerState["lastCycleMetrics"];
}): Promise<SchedulerState> {
  const state = await loadSchedulerState();
  if (state.processingLock?.runId !== input.runId) return state;

  state.processingLock = null;
  state.currentPhase = null;
  state.lastCycleDurationMs = input.durationMs;
  state.cycleCount += 1;
  state.lastHeartbeatAt = new Date().toISOString();
  state.averageCycleDurationMs =
    state.averageCycleDurationMs == null
      ? input.durationMs
      : Math.round((state.averageCycleDurationMs + input.durationMs) / 2);

  if (input.metrics) state.lastCycleMetrics = input.metrics;

  if (input.success) {
    state.lastSuccessfulCycleAt = new Date().toISOString();
    state.lastError = null;
  } else {
    state.lastError = input.error ?? "Scheduler cycle failed.";
  }

  if (state.schedulerMode === "paused") {
    state.schedulerStatus = "paused";
  } else if (state.continuousEnabled || state.schedulerMode === "continuous") {
    state.schedulerStatus = "idle";
    state.nextScheduledCycleAt = new Date(Date.now() + state.scheduleIntervalMs).toISOString();
  } else if (state.schedulerMode === "stopped") {
    state.schedulerStatus = "stopped";
    state.nextScheduledCycleAt = null;
  } else {
    state.schedulerStatus = "idle";
    state.nextScheduledCycleAt = null;
  }

  await saveSchedulerState(state);
  return state;
}

export async function appendSchedulerAudit(entry: Record<string, unknown>): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
  await appendFile(
    schedulerAuditPath(),
    `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
    "utf8",
  );
}
