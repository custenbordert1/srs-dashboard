import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import {
  P107_DEV_INTERVAL_MS,
  P107_MONITOR_VERSION,
  P107_STALE_LOCK_MS,
  type PaperworkMonitorMode,
  type PaperworkMonitorState,
} from "@/lib/paperwork-monitor/types";

function statePath(): string {
  return path.join(recruitingDataDir(), "p107-paperwork-monitor-state.json");
}

export function monitorAuditPath(): string {
  return path.join(recruitingDataDir(), "p107-paperwork-monitor-audit.jsonl");
}

function defaultState(): PaperworkMonitorState {
  const interval = Number(process.env.PAPERWORK_MONITOR_INTERVAL_MS) || P107_DEV_INTERVAL_MS;
  return {
    version: P107_MONITOR_VERSION,
    runnerStatus: "stopped",
    scheduleEnabled: false,
    scheduleIntervalMs: interval,
    lastRunAt: null,
    lastSuccessfulRunAt: null,
    processingLock: null,
    lastError: null,
    lastRunDurationMs: null,
    averageRunDurationMs: null,
    runCount: 0,
    candidateTracking: {},
    textQueue: [],
    emailQueue: [],
    recruiterQueue: [],
    needsAttention: [],
    deferredReconciliationQueue: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function loadMonitorState(): Promise<PaperworkMonitorState> {
  try {
    const raw = await readFile(statePath(), "utf8");
    const parsed = JSON.parse(raw) as PaperworkMonitorState;
    return {
      ...defaultState(),
      ...parsed,
      version: P107_MONITOR_VERSION,
      deferredReconciliationQueue: parsed.deferredReconciliationQueue ?? [],
    };
  } catch {
    return defaultState();
  }
}

export async function saveMonitorState(state: PaperworkMonitorState): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
  state.updatedAt = new Date().toISOString();
  await writeFile(statePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function isMonitorLockStale(lock: PaperworkMonitorState["processingLock"]): boolean {
  if (!lock) return true;
  return Date.now() - Date.parse(lock.lockedAt) > P107_STALE_LOCK_MS;
}

export async function tryAcquireMonitorLock(input: {
  mode: PaperworkMonitorMode;
}): Promise<{ acquired: boolean; runId: string; state: PaperworkMonitorState }> {
  const state = await loadMonitorState();
  const runId = randomUUID();

  if (state.processingLock && !isMonitorLockStale(state.processingLock)) {
    return { acquired: false, runId, state };
  }

  state.processingLock = { runId, lockedAt: new Date().toISOString(), mode: input.mode };
  state.runnerStatus = "running";
  state.lastRunAt = new Date().toISOString();
  await saveMonitorState(state);
  return { acquired: true, runId, state };
}

export async function releaseMonitorLock(input: {
  runId: string;
  success: boolean;
  error?: string | null;
  durationMs: number;
}): Promise<PaperworkMonitorState> {
  const state = await loadMonitorState();
  if (state.processingLock?.runId !== input.runId) return state;

  state.processingLock = null;
  state.runnerStatus = state.scheduleEnabled ? "idle" : "stopped";
  state.lastRunDurationMs = input.durationMs;
  state.runCount += 1;
  state.averageRunDurationMs =
    state.averageRunDurationMs == null
      ? input.durationMs
      : Math.round((state.averageRunDurationMs + input.durationMs) / 2);
  state.lastError = input.success ? null : input.error ?? "Monitor cycle failed.";

  if (input.success) {
    state.lastSuccessfulRunAt = new Date().toISOString();
  }

  await saveMonitorState(state);
  return state;
}

export async function appendMonitorAudit(entry: Record<string, unknown>): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
  await appendFile(monitorAuditPath(), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, "utf8");
}

export function monitorStatePath(): string {
  return statePath();
}
