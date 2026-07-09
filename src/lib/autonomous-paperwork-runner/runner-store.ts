import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import { P106_1_FULL_RECONCILIATION_INTERVAL_MS } from "@/lib/autonomous-paperwork-runner/runner-config";
import {
  P106_1_DEV_INTERVAL_MS,
  P106_1_RUNNER_VERSION,
  P106_1_STALE_LOCK_MS,
  type AutonomousPaperworkRunnerState,
} from "@/lib/autonomous-paperwork-runner/types";

function statePath(): string {
  return path.join(recruitingDataDir(), "p1061-autonomous-paperwork-runner-state.json");
}

export function runnerAuditPath(): string {
  return path.join(recruitingDataDir(), "p1061-autonomous-paperwork-runner-audit.jsonl");
}

function defaultState(): AutonomousPaperworkRunnerState {
  const interval = Number(process.env.AUTONOMOUS_PAPERWORK_RUNNER_INTERVAL_MS) || P106_1_DEV_INTERVAL_MS;
  return {
    version: P106_1_RUNNER_VERSION,
    runnerStatus: "stopped",
    scheduleEnabled: false,
    scheduleIntervalMs: interval,
    lastRunAt: null,
    lastSuccessfulRunAt: null,
    lastProcessedCheckpoint: null,
    processingLock: null,
    lastError: null,
    lastRunDurationMs: null,
    averageRunDurationMs: null,
    runCount: 0,
    blockedRegistry: {},
    lastFullReconciliationAt: null,
    fullReconciliationIntervalMs: P106_1_FULL_RECONCILIATION_INTERVAL_MS,
    updatedAt: new Date().toISOString(),
  };
}

export async function loadRunnerState(): Promise<AutonomousPaperworkRunnerState> {
  try {
    const raw = await readFile(statePath(), "utf8");
    const parsed = JSON.parse(raw) as AutonomousPaperworkRunnerState;
    return { ...defaultState(), ...parsed, version: P106_1_RUNNER_VERSION };
  } catch {
    return defaultState();
  }
}

export async function saveRunnerState(state: AutonomousPaperworkRunnerState): Promise<void> {
  await safeRecruitingMkdir();
  state.updatedAt = new Date().toISOString();
  await writeFile(statePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function isLockStale(lock: AutonomousPaperworkRunnerState["processingLock"]): boolean {
  if (!lock) return true;
  return Date.now() - Date.parse(lock.lockedAt) > P106_1_STALE_LOCK_MS;
}

export async function tryAcquireRunnerLock(input: {
  mode: import("@/lib/autonomous-paperwork-runner/types").AutonomousPaperworkRunnerMode;
}): Promise<{ acquired: boolean; runId: string; state: AutonomousPaperworkRunnerState }> {
  const state = await loadRunnerState();
  const runId = randomUUID();

  if (state.processingLock && !isLockStale(state.processingLock)) {
    return { acquired: false, runId, state };
  }

  state.processingLock = { runId, lockedAt: new Date().toISOString(), mode: input.mode };
  state.runnerStatus = "running";
  state.lastRunAt = new Date().toISOString();
  await saveRunnerState(state);
  return { acquired: true, runId, state };
}

export async function releaseRunnerLock(input: {
  runId: string;
  success: boolean;
  error?: string | null;
  durationMs: number;
  checkpoint?: string | null;
}): Promise<AutonomousPaperworkRunnerState> {
  const state = await loadRunnerState();
  if (state.processingLock?.runId !== input.runId) {
    return state;
  }

  state.processingLock = null;
  state.runnerStatus = state.scheduleEnabled ? "idle" : "stopped";
  state.lastRunDurationMs = input.durationMs;
  state.runCount += 1;
  state.averageRunDurationMs =
    state.averageRunDurationMs == null
      ? input.durationMs
      : Math.round((state.averageRunDurationMs + input.durationMs) / 2);
  state.lastError = input.success ? null : input.error ?? "Runner cycle failed.";

  if (input.success) {
    state.lastSuccessfulRunAt = new Date().toISOString();
    if (input.checkpoint) state.lastProcessedCheckpoint = input.checkpoint;
  }

  await saveRunnerState(state);
  return state;
}

export async function appendRunnerAudit(entry: Record<string, unknown>): Promise<void> {
  await safeRecruitingMkdir();
  await appendFile(runnerAuditPath(), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`, "utf8");
}

export function runnerStatePath(): string {
  return statePath();
}
