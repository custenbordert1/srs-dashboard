import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import {
  P125_DEFAULT_INTERVAL_MS,
  P125_RUNNER_VERSION,
  P125_STALE_HEARTBEAT_MS,
  P125_STALE_LOCK_MS,
  type ProductionRunnerDailyMetrics,
  type ProductionRunnerMode,
  type ProductionRunnerState,
} from "@/lib/p125-autonomous-paperwork-production-runner/types";

function stateFilePath(): string {
  return path.join(recruitingDataDir(), "p125-autonomous-paperwork-runner-state.json");
}

export function productionRunnerAuditPath(): string {
  return path.join(recruitingDataDir(), "p125-autonomous-paperwork-runner-audit.jsonl");
}

export function productionRunnerStatePath(): string {
  return stateFilePath();
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDailyMetrics(): ProductionRunnerDailyMetrics {
  return {
    date: todayKey(),
    candidatesProcessed: 0,
    successfulSends: 0,
    failedSends: 0,
    safetyBlocked: 0,
    totalProcessingTimeMs: 0,
  };
}

function defaultState(): ProductionRunnerState {
  const interval = Number(process.env.P125_RUNNER_INTERVAL_MS) || P125_DEFAULT_INTERVAL_MS;
  return {
    version: P125_RUNNER_VERSION,
    runnerStatus: "stopped",
    schedulerMode: "stopped",
    continuousEnabled: false,
    scheduleIntervalMs: interval,
    startedAt: null,
    lastHeartbeatAt: null,
    lastRunAt: null,
    lastSuccessfulRunAt: null,
    nextScheduledRunAt: null,
    processingLock: null,
    lastError: null,
    lastRunDurationMs: null,
    averageProcessingTimeMs: null,
    runCount: 0,
    sentCandidateIds: [],
    retryQueue: [],
    recentFailures: [],
    dailyMetrics: emptyDailyMetrics(),
    uptimeStartedAt: null,
    executeBatchCalled: false,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeDailyMetrics(state: ProductionRunnerState): ProductionRunnerDailyMetrics {
  if (state.dailyMetrics.date === todayKey()) return state.dailyMetrics;
  return emptyDailyMetrics();
}

export async function loadProductionRunnerState(): Promise<ProductionRunnerState> {
  try {
    const raw = await readFile(stateFilePath(), "utf8");
    const parsed = JSON.parse(raw) as ProductionRunnerState;
    const state = { ...defaultState(), ...parsed, version: P125_RUNNER_VERSION };
    state.dailyMetrics = normalizeDailyMetrics(state);
    state.executeBatchCalled = false;
    return state;
  } catch {
    return defaultState();
  }
}

export async function saveProductionRunnerState(state: ProductionRunnerState): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
  state.updatedAt = new Date().toISOString();
  state.executeBatchCalled = false;
  state.dailyMetrics = normalizeDailyMetrics(state);
  await writeFile(stateFilePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function isProductionLockStale(lock: ProductionRunnerState["processingLock"]): boolean {
  if (!lock) return true;
  return Date.now() - Date.parse(lock.lockedAt) > P125_STALE_LOCK_MS;
}

export function isHeartbeatStale(state: ProductionRunnerState): boolean {
  if (!state.lastHeartbeatAt) return true;
  return Date.now() - Date.parse(state.lastHeartbeatAt) > P125_STALE_HEARTBEAT_MS;
}

export async function touchProductionRunnerHeartbeat(): Promise<ProductionRunnerState> {
  const state = await loadProductionRunnerState();
  state.lastHeartbeatAt = new Date().toISOString();
  await saveProductionRunnerState(state);
  return state;
}

export async function tryAcquireProductionRunnerLock(input: {
  mode: ProductionRunnerMode;
}): Promise<{ acquired: boolean; runId: string; state: ProductionRunnerState }> {
  const state = await loadProductionRunnerState();
  const runId = randomUUID();

  if (state.runnerStatus === "paused") {
    return { acquired: false, runId, state };
  }

  if (state.processingLock && !isProductionLockStale(state.processingLock)) {
    return { acquired: false, runId, state };
  }

  if (state.processingLock && isProductionLockStale(state.processingLock)) {
    state.lastError = "Recovered stale runner lock.";
    state.processingLock = null;
  }

  state.processingLock = { runId, lockedAt: new Date().toISOString(), mode: input.mode };
  state.runnerStatus = "running";
  state.lastRunAt = new Date().toISOString();
  state.lastHeartbeatAt = new Date().toISOString();
  await saveProductionRunnerState(state);
  return { acquired: true, runId, state };
}

export async function releaseProductionRunnerLock(input: {
  runId: string;
  success: boolean;
  error?: string | null;
  durationMs: number;
}): Promise<ProductionRunnerState> {
  const state = await loadProductionRunnerState();
  if (state.processingLock?.runId !== input.runId) return state;

  state.processingLock = null;
  state.lastRunDurationMs = input.durationMs;
  state.runCount += 1;
  state.lastHeartbeatAt = new Date().toISOString();
  state.averageProcessingTimeMs =
    state.averageProcessingTimeMs == null
      ? input.durationMs
      : Math.round((state.averageProcessingTimeMs + input.durationMs) / 2);

  state.dailyMetrics = normalizeDailyMetrics(state);
  state.dailyMetrics.totalProcessingTimeMs += input.durationMs;

  if (input.success) {
    state.lastSuccessfulRunAt = new Date().toISOString();
    state.lastError = null;
  } else {
    state.lastError = input.error ?? "Runner cycle failed.";
  }

  if (state.schedulerMode === "paused") {
    state.runnerStatus = "paused";
  } else if (state.continuousEnabled || state.schedulerMode === "continuous") {
    state.runnerStatus = "idle";
    state.nextScheduledRunAt = new Date(Date.now() + state.scheduleIntervalMs).toISOString();
  } else if (state.schedulerMode === "stopped") {
    state.runnerStatus = "stopped";
    state.nextScheduledRunAt = null;
  } else {
    state.runnerStatus = "idle";
    state.nextScheduledRunAt = null;
  }

  await saveProductionRunnerState(state);
  return state;
}

export async function appendProductionRunnerAudit(entry: Record<string, unknown>): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
  await appendFile(
    productionRunnerAuditPath(),
    `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
    "utf8",
  );
}

export function recordDuplicatePrevention(
  state: ProductionRunnerState,
  candidateId: string,
): boolean {
  if (state.sentCandidateIds.includes(candidateId)) return false;
  state.sentCandidateIds = [...state.sentCandidateIds.slice(-500), candidateId];
  return true;
}

export function bumpDailyProcessed(state: ProductionRunnerState): void {
  state.dailyMetrics = normalizeDailyMetrics(state);
  state.dailyMetrics.candidatesProcessed += 1;
}

export function bumpDailySuccess(state: ProductionRunnerState): void {
  state.dailyMetrics = normalizeDailyMetrics(state);
  state.dailyMetrics.successfulSends += 1;
}

export function bumpDailyFailure(state: ProductionRunnerState): void {
  state.dailyMetrics = normalizeDailyMetrics(state);
  state.dailyMetrics.failedSends += 1;
}

export function bumpDailySafetyBlocked(state: ProductionRunnerState): void {
  state.dailyMetrics = normalizeDailyMetrics(state);
  state.dailyMetrics.safetyBlocked += 1;
}
