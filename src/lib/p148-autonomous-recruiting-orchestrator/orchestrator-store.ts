import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import {
  P148_DEFAULT_INTERVAL_MINUTES,
  P148_DEFAULT_MAX_RUNTIME_SECONDS,
  P148_MAX_RUN_HISTORY,
  P148_ORCHESTRATOR_VERSION,
  P148_STALE_LOCK_MS,
  type AutonomousRecruitingCycleResult,
  type OrchestratorLock,
  type OrchestratorPhase,
  type OrchestratorRunRecord,
  type OrchestratorState,
} from "@/lib/p148-autonomous-recruiting-orchestrator/types";

function stateFilePath(): string {
  return path.join(recruitingDataDir(), "p148-autonomous-recruiting-orchestrator-state.json");
}

function historyFilePath(): string {
  return path.join(recruitingDataDir(), "p148-autonomous-recruiting-orchestrator-history.json");
}

export function orchestratorAuditPath(): string {
  return path.join(recruitingDataDir(), "p148-autonomous-recruiting-orchestrator-audit.jsonl");
}

export function isAutonomousRecruitingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AUTONOMOUS_RECRUITING_ENABLED === "true";
}

export function getOrchestratorIntervalMinutes(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.AUTONOMOUS_RECRUITING_INTERVAL_MINUTES);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : P148_DEFAULT_INTERVAL_MINUTES;
}

export function getOrchestratorMaxRuntimeSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(env.AUTONOMOUS_RECRUITING_MAX_RUNTIME_SECONDS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : P148_DEFAULT_MAX_RUNTIME_SECONDS;
}

function defaultState(): OrchestratorState {
  const intervalMinutes = getOrchestratorIntervalMinutes();
  return {
    version: P148_ORCHESTRATOR_VERSION,
    orchestratorStatus: "stopped",
    enabled: isAutonomousRecruitingEnabled(),
    scheduleIntervalMinutes: intervalMinutes,
    maxRuntimeSeconds: getOrchestratorMaxRuntimeSeconds(),
    lastRunAt: null,
    lastSuccessfulRunAt: null,
    nextScheduledRunAt: null,
    processingLock: null,
    currentPhase: null,
    lastError: null,
    lastRunDurationMs: null,
    averageRunDurationMs: null,
    runCount: 0,
    skippedRunCount: 0,
    lastCycleResult: null,
    executeBatchCalled: false,
    updatedAt: new Date().toISOString(),
  };
}

export async function loadOrchestratorState(): Promise<OrchestratorState> {
  try {
    const raw = await readFile(stateFilePath(), "utf8");
    const parsed = JSON.parse(raw) as OrchestratorState;
    return {
      ...defaultState(),
      ...parsed,
      version: P148_ORCHESTRATOR_VERSION,
      enabled: isAutonomousRecruitingEnabled(),
      scheduleIntervalMinutes: getOrchestratorIntervalMinutes(),
      maxRuntimeSeconds: getOrchestratorMaxRuntimeSeconds(),
      executeBatchCalled: false,
    };
  } catch {
    return defaultState();
  }
}

export async function saveOrchestratorState(state: OrchestratorState): Promise<void> {
  await safeRecruitingMkdir();
  state.updatedAt = new Date().toISOString();
  state.executeBatchCalled = false;
  await writeFile(stateFilePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function isOrchestratorLockStale(lock: OrchestratorLock | null): boolean {
  if (!lock) return true;
  return Date.now() - Date.parse(lock.lockedAt) > P148_STALE_LOCK_MS;
}

export async function tryAcquireOrchestratorLock(input: {
  dryRun: boolean;
  phase?: OrchestratorPhase;
}): Promise<{ acquired: boolean; runId: string; state: OrchestratorState }> {
  const state = await loadOrchestratorState();
  const runId = randomUUID();

  if (state.processingLock && !isOrchestratorLockStale(state.processingLock)) {
    return { acquired: false, runId, state };
  }

  if (state.processingLock && isOrchestratorLockStale(state.processingLock)) {
    state.lastError = "Recovered stale orchestrator lock.";
    state.processingLock = null;
  }

  state.processingLock = {
    runId,
    lockedAt: new Date().toISOString(),
    dryRun: input.dryRun,
    currentPhase: input.phase ?? null,
  };
  state.orchestratorStatus = "running";
  state.currentPhase = input.phase ?? null;
  state.lastRunAt = new Date().toISOString();
  await saveOrchestratorState(state);
  return { acquired: true, runId, state };
}

export async function touchOrchestratorPhase(
  runId: string,
  phase: OrchestratorPhase,
): Promise<OrchestratorState> {
  const state = await loadOrchestratorState();
  if (state.processingLock?.runId !== runId) return state;
  state.currentPhase = phase;
  state.processingLock.currentPhase = phase;
  await saveOrchestratorState(state);
  return state;
}

export async function releaseOrchestratorLock(input: {
  runId: string;
  success: boolean;
  error?: string | null;
  durationMs: number;
  result?: AutonomousRecruitingCycleResult | null;
  skipped?: boolean;
}): Promise<OrchestratorState> {
  const state = await loadOrchestratorState();
  if (state.processingLock?.runId !== input.runId) return state;

  state.processingLock = null;
  state.currentPhase = null;
  state.lastRunDurationMs = input.durationMs;
  state.runCount += 1;
  if (input.skipped) state.skippedRunCount += 1;

  state.averageRunDurationMs =
    state.averageRunDurationMs == null
      ? input.durationMs
      : Math.round((state.averageRunDurationMs + input.durationMs) / 2);

  if (input.result) state.lastCycleResult = input.result;

  if (input.success) {
    state.lastSuccessfulRunAt = new Date().toISOString();
    state.lastError = null;
    state.orchestratorStatus = state.enabled ? "idle" : "stopped";
  } else {
    state.lastError = input.error ?? "Orchestrator cycle failed.";
    state.orchestratorStatus = state.enabled ? "idle" : "stopped";
  }

  if (state.enabled) {
    state.nextScheduledRunAt = new Date(
      Date.now() + state.scheduleIntervalMinutes * 60_000,
    ).toISOString();
  } else {
    state.nextScheduledRunAt = null;
  }

  await saveOrchestratorState(state);
  return state;
}

export async function loadOrchestratorRunHistory(): Promise<OrchestratorRunRecord[]> {
  try {
    const raw = await readFile(historyFilePath(), "utf8");
    const parsed = JSON.parse(raw) as OrchestratorRunRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendOrchestratorRunRecord(
  record: OrchestratorRunRecord,
): Promise<void> {
  const existing = await loadOrchestratorRunHistory();
  const next = [record, ...existing].slice(0, P148_MAX_RUN_HISTORY);
  await safeRecruitingMkdir();
  await writeFile(historyFilePath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

export async function appendOrchestratorAudit(entry: Record<string, unknown>): Promise<void> {
  await safeRecruitingMkdir();
  await appendFile(
    orchestratorAuditPath(),
    `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
    "utf8",
  );
}
