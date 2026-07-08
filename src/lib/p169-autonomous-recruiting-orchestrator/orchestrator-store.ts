import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  mergeP169Config,
  resolveP169EnvConfig,
} from "@/lib/p169-autonomous-recruiting-orchestrator/orchestrator-config";
import {
  P169_MAX_CYCLE_HISTORY,
  P169_ORCHESTRATOR_VERSION,
  P169_STALE_LOCK_MS,
  type P169CandidateEvaluation,
  type P169OrchestratorConfig,
  type P169OrchestratorCycleRecord,
  type P169OrchestratorState,
} from "@/lib/p169-autonomous-recruiting-orchestrator/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

function statePath(): string {
  return path.join(recruitingDataDir(), "p169-autonomous-orchestrator-state.json");
}

function historyPath(): string {
  return path.join(recruitingDataDir(), "p169-autonomous-orchestrator-history.json");
}

function defaultState(): P169OrchestratorState {
  const config = resolveP169EnvConfig();
  return {
    version: P169_ORCHESTRATOR_VERSION,
    status: config.enabled && !config.paused ? "idle" : "paused",
    config,
    lastCycleAt: null,
    lastSuccessfulCycleAt: null,
    nextCycleAt: null,
    consecutiveFailures: 0,
    processingLock: null,
    lastCycle: null,
    lastCandidateEvaluations: [],
    executiveAlertRaisedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function loadP169OrchestratorState(): Promise<P169OrchestratorState> {
  try {
    const raw = await readFile(statePath(), "utf8");
    const parsed = JSON.parse(raw) as P169OrchestratorState;
    const config = mergeP169Config(parsed.config);
    const paused = Boolean(config.paused || !config.enabled);
    return {
      ...defaultState(),
      ...parsed,
      version: P169_ORCHESTRATOR_VERSION,
      config,
      status: paused ? "paused" : parsed.status === "running" ? "running" : "idle",
    };
  } catch {
    return defaultState();
  }
}

export async function saveP169OrchestratorState(state: P169OrchestratorState): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
  state.updatedAt = new Date().toISOString();
  await writeFile(statePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function loadP169CycleHistory(): Promise<P169OrchestratorCycleRecord[]> {
  try {
    const raw = await readFile(historyPath(), "utf8");
    const parsed = JSON.parse(raw) as P169OrchestratorCycleRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendP169CycleRecord(
  record: P169OrchestratorCycleRecord,
): Promise<P169OrchestratorCycleRecord[]> {
  const history = await loadP169CycleHistory();
  const next = [record, ...history].slice(0, P169_MAX_CYCLE_HISTORY);
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(historyPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function isP169LockStale(lock: P169OrchestratorState["processingLock"]): boolean {
  if (!lock) return true;
  return Date.now() - Date.parse(lock.lockedAt) > P169_STALE_LOCK_MS;
}

export async function tryAcquireP169Lock(cycleId: string): Promise<boolean> {
  const state = await loadP169OrchestratorState();
  if (state.processingLock && !isP169LockStale(state.processingLock)) return false;
  state.processingLock = { cycleId, lockedAt: new Date().toISOString() };
  state.status = "running";
  await saveP169OrchestratorState(state);
  return true;
}

export async function releaseP169Lock(): Promise<void> {
  const state = await loadP169OrchestratorState();
  state.processingLock = null;
  state.status = state.config.enabled && !state.config.paused ? "idle" : "paused";
  await saveP169OrchestratorState(state);
}

export async function updateP169Config(
  patch: Partial<P169OrchestratorConfig>,
): Promise<P169OrchestratorConfig> {
  const state = await loadP169OrchestratorState();
  state.config = {
    ...state.config,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  if (state.config.paused || !state.config.enabled) {
    state.status = "paused";
  }
  await saveP169OrchestratorState(state);
  return state.config;
}

export function createP169CycleId(): string {
  return `p169-${randomUUID()}`;
}

export async function persistP169CycleResult(input: {
  record: P169OrchestratorCycleRecord;
  evaluations: P169CandidateEvaluation[];
  consecutiveFailures: number;
  executiveAlertRaised: boolean;
}): Promise<void> {
  const state = await loadP169OrchestratorState();
  const intervalMs = state.config.cycleIntervalMs;
  state.lastCycle = input.record;
  state.lastCycleAt = input.record.completedAt;
  state.lastCandidateEvaluations = input.evaluations;
  state.consecutiveFailures = input.consecutiveFailures;
  if (input.record.status === "success" || input.record.status === "partial") {
    state.lastSuccessfulCycleAt = input.record.completedAt;
    state.consecutiveFailures = 0;
  }
  if (input.executiveAlertRaised) {
    state.executiveAlertRaisedAt = new Date().toISOString();
  }
  state.nextCycleAt = new Date(Date.now() + intervalMs).toISOString();
  state.status = state.config.enabled && !state.config.paused ? "idle" : "paused";
  await saveP169OrchestratorState(state);
  await appendP169CycleRecord(input.record);
}
