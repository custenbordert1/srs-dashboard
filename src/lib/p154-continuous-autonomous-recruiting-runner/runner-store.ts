import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import {
  getP154IntervalMs,
  isP154ContinuousEnabled,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import type {
  P1547CycleMetrics,
  P1547DailyMetrics,
  P1547ProcessingLock,
  P1547RunnerState,
  P1547SchedulerMode,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/types";
import {
  P1547_RUNNER_VERSION,
  P1547_STALE_LOCK_MS,
} from "@/lib/p154-continuous-autonomous-recruiting-runner/types";

function statePath(): string {
  return path.join(recruitingDataDir(), "p154-continuous-autonomous-recruiting-runner-state.json");
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDailyMetrics(): P1547DailyMetrics {
  return {
    date: todayKey(),
    sent: 0,
    signaturesCompleted: 0,
    assigned: 0,
    duplicatesPrevented: 0,
    errors: 0,
  };
}

function defaultState(): P1547RunnerState {
  return {
    version: P1547_RUNNER_VERSION,
    currentStatus: "stopped",
    schedulerMode: "stopped",
    continuousEnabled: false,
    scheduleIntervalMs: getP154IntervalMs(),
    serverStartTime: null,
    lastRun: null,
    nextRun: null,
    lastSuccessfulRun: null,
    cycleDurationMs: null,
    averageCycleDurationMs: null,
    runCount: 0,
    processingLock: null,
    lastError: null,
    candidatesEvaluated: 0,
    assigned: 0,
    sent: 0,
    skipped: 0,
    duplicatesPrevented: 0,
    errors: 0,
    queueRemaining: 0,
    dailyMetrics: emptyDailyMetrics(),
    recentCycles: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeDailyMetrics(state: P1547RunnerState): P1547DailyMetrics {
  if (state.dailyMetrics.date === todayKey()) return state.dailyMetrics;
  return emptyDailyMetrics();
}

export async function loadP1547RunnerState(): Promise<P1547RunnerState> {
  try {
    const raw = await readFile(statePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<P1547RunnerState>;
    const state = { ...defaultState(), ...parsed, version: P1547_RUNNER_VERSION };
    state.dailyMetrics = normalizeDailyMetrics(state);
    return state;
  } catch {
    return defaultState();
  }
}

export async function saveP1547RunnerState(state: P1547RunnerState): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
  state.updatedAt = new Date().toISOString();
  state.dailyMetrics = normalizeDailyMetrics(state);
  await writeFile(statePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function isP1547LockStale(lock: P1547ProcessingLock | null): boolean {
  if (!lock) return true;
  return Date.now() - Date.parse(lock.lockedAt) > P1547_STALE_LOCK_MS;
}

export async function resetP1547RunnerLock(): Promise<P1547RunnerState> {
  const state = await loadP1547RunnerState();
  state.processingLock = null;
  if (state.currentStatus === "running") {
    state.currentStatus = "idle";
  }
  await saveP1547RunnerState(state);
  return state;
}

export async function tryAcquireP1547RunnerLock(input: {
  mode: P1547SchedulerMode;
}): Promise<{ acquired: boolean; runId: string; state: P1547RunnerState }> {
  const state = await loadP1547RunnerState();
  const runId = randomUUID();
  if (state.currentStatus === "paused") {
    return { acquired: false, runId, state };
  }
  if (state.processingLock && !isP1547LockStale(state.processingLock)) {
    return { acquired: false, runId, state };
  }
  if (state.processingLock && isP1547LockStale(state.processingLock)) {
    state.processingLock = null;
  }
  state.processingLock = { runId, lockedAt: new Date().toISOString(), mode: input.mode };
  state.currentStatus = "running";
  await saveP1547RunnerState(state);
  return { acquired: true, runId, state };
}

export async function releaseP1547RunnerLock(runId: string): Promise<void> {
  const state = await loadP1547RunnerState();
  if (state.processingLock?.runId === runId) {
    state.processingLock = null;
    state.currentStatus = state.schedulerMode === "continuous" ? "idle" : "stopped";
    await saveP1547RunnerState(state);
  }
}

export async function recordP1547CycleMetrics(metrics: P1547CycleMetrics): Promise<P1547RunnerState> {
  const state = await loadP1547RunnerState();
  state.runCount += 1;
  state.lastRun = metrics.startedAt;
  state.cycleDurationMs = metrics.durationMs;
  state.candidatesEvaluated = metrics.candidatesEvaluated;
  state.assigned = metrics.assigned;
  state.sent = metrics.sent;
  state.skipped = metrics.skipped;
  state.duplicatesPrevented = metrics.duplicatesPrevented;
  state.errors = metrics.errors;
  state.queueRemaining = metrics.queueRemaining;
  state.recentCycles = [metrics, ...state.recentCycles].slice(0, 20);
  if (metrics.errors === 0 && !metrics.dryRun) {
    state.lastSuccessfulRun = metrics.completedAt ?? metrics.startedAt;
  }
  if (state.averageCycleDurationMs === null) {
    state.averageCycleDurationMs = metrics.durationMs;
  } else {
    state.averageCycleDurationMs = Math.round((state.averageCycleDurationMs + metrics.durationMs) / 2);
  }
  state.dailyMetrics.sent += metrics.sent;
  state.dailyMetrics.assigned += metrics.assigned;
  state.dailyMetrics.duplicatesPrevented += metrics.duplicatesPrevented;
  state.dailyMetrics.errors += metrics.errors;
  await saveP1547RunnerState(state);
  return state;
}

export async function markP1547RunnerStarted(): Promise<P1547RunnerState> {
  const state = await loadP1547RunnerState();
  const now = new Date().toISOString();
  state.serverStartTime = state.serverStartTime ?? now;
  state.continuousEnabled = isP154ContinuousEnabled();
  state.scheduleIntervalMs = getP154IntervalMs();
  state.schedulerMode = state.continuousEnabled ? "continuous" : state.schedulerMode;
  state.currentStatus = "idle";
  state.nextRun = new Date(Date.now() + state.scheduleIntervalMs).toISOString();
  await saveP1547RunnerState(state);
  return state;
}

export async function stopP1547Runner(): Promise<P1547RunnerState> {
  const state = await loadP1547RunnerState();
  state.schedulerMode = "stopped";
  state.continuousEnabled = false;
  state.currentStatus = "stopped";
  state.nextRun = null;
  state.processingLock = null;
  await saveP1547RunnerState(state);
  return state;
}

export function p1547RunnerStatePath(): string {
  return statePath();
}
