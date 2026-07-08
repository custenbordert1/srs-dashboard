import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  mergeP171Config,
  resolveP171EnvConfig,
} from "@/lib/p171-autonomous-candidate-lifecycle-manager/lifecycle-config";
import {
  P171_LIFECYCLE_STATE_ORDER,
  P171_LIFECYCLE_VERSION,
  P171_MAX_CYCLE_HISTORY,
  P171_STALE_LOCK_MS,
  type P171CandidateLifecycleRecord,
  type P171LifecycleConfig,
  type P171LifecycleCycleRecord,
  type P171LifecycleManagerState,
  type P171LifecycleState,
  type P171LifecycleTransition,
} from "@/lib/p171-autonomous-candidate-lifecycle-manager/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";

function statePath(): string {
  return path.join(recruitingDataDir(), "p171-lifecycle-manager-state.json");
}

function historyPath(): string {
  return path.join(recruitingDataDir(), "p171-lifecycle-manager-history.json");
}

function defaultState(): P171LifecycleManagerState {
  const config = resolveP171EnvConfig();
  return {
    version: P171_LIFECYCLE_VERSION,
    status: config.enabled && !config.paused ? "idle" : "paused",
    config,
    lastCycleAt: null,
    lastSuccessfulCycleAt: null,
    nextCycleAt: null,
    consecutiveFailures: 0,
    processingLock: null,
    lastCycle: null,
    candidates: {},
    executiveAlertRaisedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function loadP171LifecycleState(): Promise<P171LifecycleManagerState> {
  try {
    const raw = await readFile(statePath(), "utf8");
    const parsed = JSON.parse(raw) as P171LifecycleManagerState;
    const config = mergeP171Config(parsed.config);
    const paused = Boolean(config.paused || !config.enabled);
    return {
      ...defaultState(),
      ...parsed,
      version: P171_LIFECYCLE_VERSION,
      config,
      candidates: parsed.candidates ?? {},
      status: paused ? "paused" : parsed.status === "running" ? "running" : "idle",
    };
  } catch {
    return defaultState();
  }
}

export async function saveP171LifecycleState(state: P171LifecycleManagerState): Promise<void> {
  await mkdir(recruitingDataDir(), { recursive: true });
  state.updatedAt = new Date().toISOString();
  await writeFile(statePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function loadP171CycleHistory(): Promise<P171LifecycleCycleRecord[]> {
  try {
    const raw = await readFile(historyPath(), "utf8");
    const parsed = JSON.parse(raw) as P171LifecycleCycleRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendP171CycleRecord(
  record: P171LifecycleCycleRecord,
): Promise<P171LifecycleCycleRecord[]> {
  const history = await loadP171CycleHistory();
  const next = [record, ...history].slice(0, P171_MAX_CYCLE_HISTORY);
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(historyPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function isP171LockStale(lock: P171LifecycleManagerState["processingLock"]): boolean {
  if (!lock) return true;
  return Date.now() - Date.parse(lock.lockedAt) > P171_STALE_LOCK_MS;
}

export async function tryAcquireP171Lock(cycleId: string): Promise<boolean> {
  const state = await loadP171LifecycleState();
  if (state.processingLock && !isP171LockStale(state.processingLock)) return false;
  state.processingLock = { cycleId, lockedAt: new Date().toISOString() };
  state.status = "running";
  await saveP171LifecycleState(state);
  return true;
}

export async function releaseP171Lock(): Promise<void> {
  const state = await loadP171LifecycleState();
  state.processingLock = null;
  state.status = state.config.enabled && !state.config.paused ? "idle" : "paused";
  await saveP171LifecycleState(state);
}

export async function updateP171Config(
  patch: Partial<P171LifecycleConfig>,
): Promise<P171LifecycleConfig> {
  const state = await loadP171LifecycleState();
  state.config = {
    ...state.config,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  if (state.config.paused || !state.config.enabled) {
    state.status = "paused";
  }
  await saveP171LifecycleState(state);
  return state.config;
}

export function createP171CycleId(): string {
  return `p171-${randomUUID()}`;
}

export function createP171TransitionId(): string {
  return `p171t-${randomUUID()}`;
}

export function getP171CandidateRecord(
  state: P171LifecycleManagerState,
  candidateId: string,
): P171CandidateLifecycleRecord | null {
  return state.candidates[candidateId] ?? null;
}

export function listP171CandidateRecords(
  state: P171LifecycleManagerState,
): P171CandidateLifecycleRecord[] {
  return Object.values(state.candidates);
}

export function listP171Exceptions(
  state: P171LifecycleManagerState,
): P171CandidateLifecycleRecord[] {
  return listP171CandidateRecords(state).filter(
    (record) => record.state === "EXCEPTION" && !record.exceptionResolvedAt,
  );
}

/** Deterministic forward-only transition — returns null if no change. */
export function canTransitionP171State(
  from: P171LifecycleState,
  to: P171LifecycleState,
): boolean {
  if (from === to) return false;
  if (to === "EXCEPTION") return true;
  if (from === "EXCEPTION") return false;
  if (from === "COMPLETED" || from === "PLACED") return false;

  const fromIdx = P171_LIFECYCLE_STATE_ORDER.indexOf(from);
  const toIdx = P171_LIFECYCLE_STATE_ORDER.indexOf(to);
  if (fromIdx < 0 || toIdx < 0) return false;
  return toIdx > fromIdx;
}

export function applyP171Transition(input: {
  record: P171CandidateLifecycleRecord;
  to: P171LifecycleState;
  cycleId: string | null;
  reason: string;
  source: P171LifecycleTransition["source"];
  now?: string;
}): P171CandidateLifecycleRecord {
  const now = input.now ?? new Date().toISOString();
  const from = input.record.state;
  if (!canTransitionP171State(from, input.to) && from !== input.to) {
    return input.record;
  }
  if (from === input.to) return input.record;

  const transition: P171LifecycleTransition = {
    id: createP171TransitionId(),
    from,
    to: input.to,
    at: now,
    cycleId: input.cycleId,
    reason: input.reason,
    source: input.source,
    auditable: true,
  };

  const next: P171CandidateLifecycleRecord = {
    ...input.record,
    state: input.to,
    transitions: [...input.record.transitions, transition],
    updatedAt: now,
    lastProcessedCycleId: input.cycleId,
  };

  if (input.to === "DISCOVERED" && !next.discoveredAt) next.discoveredAt = now;
  if (input.to === "UNDER_REVIEW" || input.to === "APPROVED") next.evaluatedAt = now;
  if (input.to === "PAPERWORK_SENT") next.paperworkSentAt = now;
  if (input.to === "SIGNED") next.signedAt = now;
  if (input.to === "READY_FOR_MEL") next.readyForMelAt = now;

  return next;
}

export async function persistP171CycleResult(input: {
  record: P171LifecycleCycleRecord;
  candidates: Record<string, P171CandidateLifecycleRecord>;
  consecutiveFailures: number;
  executiveAlertRaised: boolean;
}): Promise<void> {
  const state = await loadP171LifecycleState();
  const intervalMs = state.config.cycleIntervalMs;
  state.lastCycle = input.record;
  state.lastCycleAt = input.record.completedAt;
  state.candidates = { ...state.candidates, ...input.candidates };
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
  await saveP171LifecycleState(state);
  await appendP171CycleRecord(input.record);
}
