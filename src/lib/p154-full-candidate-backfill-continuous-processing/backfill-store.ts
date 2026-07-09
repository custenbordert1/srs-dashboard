import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {recruitingDataDir, safeRecruitingMkdir } from "@/lib/recruiting-data-dir";
import {
  getP154BackfillSince,
  getP1544MaxAssignmentsPerCycle,
  getP1544MaxSendsPerCycle,
  getP154IntervalMs,
  isP154ContinuousEnabled,
} from "@/lib/p154-full-candidate-backfill-continuous-processing/config";
import type {
  P1544ContinuousState,
  P1544DashboardMetrics,
  P1544ProcessingLock,
  P1544SchedulerMode,
} from "@/lib/p154-full-candidate-backfill-continuous-processing/types";
import {
  P1544_SOURCE_PHASE,
  P1544_STALE_LOCK_MS,
} from "@/lib/p154-full-candidate-backfill-continuous-processing/types";

const STATE_VERSION = "P154.4";

function statePath(): string {
  return path.join(recruitingDataDir(), "p154-full-candidate-backfill-continuous-state.json");
}

function emptyDashboard(): P1544DashboardMetrics {
  return {
    totalCandidatesScanned: 0,
    totalSinceJune: 0,
    newCandidatesDiscovered: 0,
    eligibleToday: 0,
    sentToday: 0,
    signedToday: 0,
    activeSignatureRequests: 0,
    duplicatesPrevented: 0,
    queueRemaining: 0,
    nextScheduledRunAt: null,
    lastSuccessfulRunAt: null,
  };
}

function defaultState(): P1544ContinuousState {
  return {
    version: STATE_VERSION,
    schedulerMode: "stopped",
    continuousEnabled: isP154ContinuousEnabled(),
    scheduleIntervalMs: getP154IntervalMs(),
    backfillSince: getP154BackfillSince(),
    limits: {
      maxAssignmentsPerCycle: getP1544MaxAssignmentsPerCycle(),
      maxPaperworkSendsPerCycle: getP1544MaxSendsPerCycle(),
    },
    processingLock: null,
    lastBackfillAt: null,
    lastCycleAt: null,
    lastSuccessfulCycleAt: null,
    nextScheduledRunAt: null,
    lastError: null,
    dashboard: emptyDashboard(),
    updatedAt: new Date().toISOString(),
  };
}

export async function loadP1544State(): Promise<P1544ContinuousState> {
  try {
    const raw = await readFile(statePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<P1544ContinuousState>;
    return {
      ...defaultState(),
      ...parsed,
      version: STATE_VERSION,
      dashboard: { ...emptyDashboard(), ...parsed.dashboard },
      limits: { ...defaultState().limits, ...parsed.limits },
    };
  } catch {
    return defaultState();
  }
}

export async function saveP1544State(state: P1544ContinuousState): Promise<void> {
  await safeRecruitingMkdir();
  state.updatedAt = new Date().toISOString();
  await writeFile(statePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function isP1544LockStale(lock: P1544ProcessingLock | null): boolean {
  if (!lock) return true;
  return Date.now() - Date.parse(lock.lockedAt) > P1544_STALE_LOCK_MS;
}

export async function tryAcquireP1544Lock(input: {
  mode: P1544SchedulerMode;
}): Promise<{ acquired: boolean; runId: string; state: P1544ContinuousState }> {
  const state = await loadP1544State();
  const runId = randomUUID();

  if (state.schedulerMode === "paused") {
    return { acquired: false, runId, state };
  }

  if (state.processingLock && !isP1544LockStale(state.processingLock)) {
    return { acquired: false, runId, state };
  }

  state.processingLock = { runId, lockedAt: new Date().toISOString(), mode: input.mode };
  await saveP1544State(state);
  return { acquired: true, runId, state };
}

export async function releaseP1544Lock(runId: string): Promise<void> {
  const state = await loadP1544State();
  if (state.processingLock?.runId === runId) {
    state.processingLock = null;
    await saveP1544State(state);
  }
}

export function p1544StateFilePath(): string {
  return statePath();
}

export { P1544_SOURCE_PHASE };
