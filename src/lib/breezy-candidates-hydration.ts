import type { BreezyCandidatesScanMode } from "@/lib/breezy-api";
import { logBreezyCandidatesOps } from "@/lib/breezy-candidates-ops-log";

function newHydrationId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `hydration-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Heartbeat older than this is treated as stale — hydration can be safely resumed. */
export const BREEZY_HYDRATION_HEARTBEAT_STALE_MS = 120_000;
/** In-memory hydration job TTL when not actively heartbeating. */
export const BREEZY_HYDRATION_STATE_TTL_MS = 30 * 60 * 1000;

export type BreezyHydrationJobState = {
  hydrationRoundId: string;
  companyId: string;
  positionsScanned: number;
  totalPositionsAvailable: number;
  completedPositionIds: string[];
  skippedPositionIds: string[];
  queueRemaining: number;
  hydrationPercent: number;
  startedAt: string;
  lastSuccessfulHydrationAt: string | null;
  hydrationInProgress: boolean;
  hydrationOwnerId: string | null;
  hydrationHeartbeat: string | null;
  hydrationStartedAt: string | null;
  resumeCount: number;
  restartCount: number;
  lastContinuationPoint: number;
  estimatedRemainingPositions: number;
  candidateCountAtLastSuccess: number;
  hydrationComplete: boolean;
  expiresAt: number;
};

export type BreezyHydrationJobSnapshot = Omit<BreezyHydrationJobState, "expiresAt" | "completedPositionIds" | "skippedPositionIds"> & {
  completedPositionCount: number;
  skippedPositionCount: number;
};

export type HydrationResumePlan = {
  hydrationRoundId: string;
  resumeOffset: number;
  attachedToExisting: boolean;
  resumedFromStale: boolean;
  restarted: boolean;
};

const hydrationJobs = new Map<string, BreezyHydrationJobState>();

function hydrationKey(companyId: string): string {
  return companyId.trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function isHeartbeatStale(state: BreezyHydrationJobState, now = Date.now()): boolean {
  if (!state.hydrationHeartbeat) return true;
  const heartbeatMs = Date.parse(state.hydrationHeartbeat);
  if (Number.isNaN(heartbeatMs)) return true;
  return now - heartbeatMs > BREEZY_HYDRATION_HEARTBEAT_STALE_MS;
}

function isStateExpired(state: BreezyHydrationJobState, now = Date.now()): boolean {
  return state.expiresAt <= now;
}

export function toHydrationJobSnapshot(state: BreezyHydrationJobState): BreezyHydrationJobSnapshot {
  const {
    expiresAt: _expiresAt,
    completedPositionIds,
    skippedPositionIds,
    ...rest
  } = state;
  return {
    ...rest,
    completedPositionCount: completedPositionIds.length,
    skippedPositionCount: skippedPositionIds.length,
  };
}

export function getHydrationJobState(companyId: string): BreezyHydrationJobState | null {
  const key = hydrationKey(companyId);
  const state = hydrationJobs.get(key);
  if (!state) return null;
  if (isStateExpired(state) && !state.hydrationInProgress) {
    hydrationJobs.delete(key);
    return null;
  }
  return state;
}

export function resetHydrationJobState(companyId: string, reason: string): BreezyHydrationJobState {
  const key = hydrationKey(companyId);
  const prior = hydrationJobs.get(key);
  const restarted: BreezyHydrationJobState = {
    hydrationRoundId: newHydrationId(),
    companyId: key,
    positionsScanned: 0,
    totalPositionsAvailable: prior?.totalPositionsAvailable ?? 0,
    completedPositionIds: [],
    skippedPositionIds: [],
    queueRemaining: prior?.totalPositionsAvailable ?? 0,
    hydrationPercent: 0,
    startedAt: nowIso(),
    lastSuccessfulHydrationAt: null,
    hydrationInProgress: false,
    hydrationOwnerId: null,
    hydrationHeartbeat: null,
    hydrationStartedAt: null,
    resumeCount: prior?.resumeCount ?? 0,
    restartCount: (prior?.restartCount ?? 0) + 1,
    lastContinuationPoint: 0,
    estimatedRemainingPositions: prior?.totalPositionsAvailable ?? 0,
    candidateCountAtLastSuccess: prior?.candidateCountAtLastSuccess ?? 0,
    hydrationComplete: false,
    expiresAt: Date.now() + BREEZY_HYDRATION_STATE_TTL_MS,
  };
  hydrationJobs.set(key, restarted);
  logBreezyCandidatesOps("server", "request_start", {
    phase: "hydration_reset",
    companyId: key,
    reason,
    hydrationRoundId: restarted.hydrationRoundId,
    restartCount: restarted.restartCount,
  });
  return restarted;
}

export function beginHydrationSession(input: {
  companyId: string;
  ownerId: string;
  totalPositionsAvailable: number;
  seedContinuationPoint?: number;
  seedCandidateCount?: number;
  force?: boolean;
}): HydrationResumePlan {
  const key = hydrationKey(input.companyId);
  const existing = getHydrationJobState(key);
  const now = Date.now();

  if (input.force) {
    resetHydrationJobState(key, "force_reset");
  } else if (existing && isStateExpired(existing, now)) {
    resetHydrationJobState(key, "state_expired");
  } else if (existing && existing.companyId !== key) {
    resetHydrationJobState(key, "company_changed");
  }

  let state = getHydrationJobState(key);
  if (!state) {
    const seed = Math.max(0, input.seedContinuationPoint ?? 0);
    state = {
      hydrationRoundId: newHydrationId(),
      companyId: key,
      positionsScanned: seed,
      totalPositionsAvailable: input.totalPositionsAvailable,
      completedPositionIds: [],
      skippedPositionIds: [],
      queueRemaining: Math.max(0, input.totalPositionsAvailable - seed),
      hydrationPercent:
        input.totalPositionsAvailable > 0
          ? Math.min(100, Math.round((seed / input.totalPositionsAvailable) * 100))
          : 0,
      startedAt: nowIso(),
      lastSuccessfulHydrationAt: seed > 0 ? nowIso() : null,
      hydrationInProgress: true,
      hydrationOwnerId: input.ownerId,
      hydrationHeartbeat: nowIso(),
      hydrationStartedAt: nowIso(),
      resumeCount: 0,
      restartCount: 0,
      lastContinuationPoint: seed,
      estimatedRemainingPositions: Math.max(0, input.totalPositionsAvailable - seed),
      candidateCountAtLastSuccess: input.seedCandidateCount ?? 0,
      hydrationComplete: seed >= input.totalPositionsAvailable && input.totalPositionsAvailable > 0,
      expiresAt: now + BREEZY_HYDRATION_STATE_TTL_MS,
    };
    hydrationJobs.set(key, state);
    return {
      hydrationRoundId: state.hydrationRoundId,
      resumeOffset: seed,
      attachedToExisting: false,
      resumedFromStale: false,
      restarted: Boolean(input.force),
    };
  }

  const stale = isHeartbeatStale(state, now);
  const attachedToExisting = state.hydrationInProgress && !stale && state.hydrationOwnerId !== input.ownerId;
  const resumedFromStale = state.hydrationInProgress && stale;

  if (attachedToExisting || resumedFromStale) {
    state.resumeCount += 1;
  }

  if (state.hydrationComplete) {
    return {
      hydrationRoundId: state.hydrationRoundId,
      resumeOffset: state.lastContinuationPoint,
      attachedToExisting: true,
      resumedFromStale: false,
      restarted: false,
    };
  }

  state.totalPositionsAvailable = Math.max(state.totalPositionsAvailable, input.totalPositionsAvailable);
  state.hydrationInProgress = true;
  state.hydrationOwnerId = input.ownerId;
  state.hydrationHeartbeat = nowIso();
  state.hydrationStartedAt = state.hydrationStartedAt ?? nowIso();
  state.expiresAt = now + BREEZY_HYDRATION_STATE_TTL_MS;
  state.queueRemaining = Math.max(0, state.totalPositionsAvailable - state.lastContinuationPoint);
  state.estimatedRemainingPositions = state.queueRemaining;
  state.hydrationPercent =
    state.totalPositionsAvailable > 0
      ? Math.min(100, Math.round((state.lastContinuationPoint / state.totalPositionsAvailable) * 100))
      : state.hydrationPercent;

  hydrationJobs.set(key, state);

  return {
    hydrationRoundId: state.hydrationRoundId,
    resumeOffset: state.lastContinuationPoint,
    attachedToExisting,
    resumedFromStale,
    restarted: false,
  };
}

export function touchHydrationHeartbeat(companyId: string, ownerId: string): void {
  const state = getHydrationJobState(companyId);
  if (!state || state.hydrationOwnerId !== ownerId) return;
  state.hydrationHeartbeat = nowIso();
  state.expiresAt = Date.now() + BREEZY_HYDRATION_STATE_TTL_MS;
}

export function releaseHydrationSession(companyId: string, ownerId: string, complete = false): void {
  const state = getHydrationJobState(companyId);
  if (!state || state.hydrationOwnerId !== ownerId) return;
  state.hydrationInProgress = false;
  state.hydrationOwnerId = null;
  state.hydrationComplete = complete || state.hydrationComplete;
  state.expiresAt = Date.now() + BREEZY_HYDRATION_STATE_TTL_MS;
}

export function resolveHydrationResumeOffset(input: {
  companyId: string;
  ownerId: string;
  totalPositionsAvailable: number;
  requestedOffset?: number;
  force?: boolean;
  seedContinuationPoint?: number;
  seedCandidateCount?: number;
}): HydrationResumePlan {
  if (input.force) {
    resetHydrationJobState(input.companyId, "force_reset");
  }
  return beginHydrationSession({
    companyId: input.companyId,
    ownerId: input.ownerId,
    totalPositionsAvailable: input.totalPositionsAvailable,
    seedContinuationPoint: Math.max(
      input.seedContinuationPoint ?? 0,
      input.requestedOffset ?? 0,
    ),
    seedCandidateCount: input.seedCandidateCount,
    force: false,
  });
}

export function recordHydrationBatchProgress(input: {
  companyId: string;
  ownerId: string;
  scanMode: BreezyCandidatesScanMode;
  totalPositionsAvailable: number;
  absolutePositionsScanned: number;
  completedPositionIds: string[];
  skippedPositionIds: string[];
  candidateCount: number;
  truncated: boolean;
  hydrationRoundId?: string;
}): BreezyHydrationJobState | null {
  if (input.scanMode === "preview" || input.scanMode === "fast") {
    return getHydrationJobState(input.companyId);
  }

  const state = getHydrationJobState(input.companyId);
  if (!state) return null;
  if (input.hydrationRoundId && state.hydrationRoundId !== input.hydrationRoundId) {
    return state;
  }

  const priorContinuation = state.lastContinuationPoint;
  const nextContinuation = Math.max(priorContinuation, input.absolutePositionsScanned);
  if (nextContinuation < priorContinuation) {
    logBreezyCandidatesOps("server", "fallback", {
      phase: "hydration_regress_blocked",
      companyId: input.companyId,
      priorContinuation,
      attemptedContinuation: input.absolutePositionsScanned,
    });
    return state;
  }

  state.totalPositionsAvailable = Math.max(state.totalPositionsAvailable, input.totalPositionsAvailable);
  state.positionsScanned = nextContinuation;
  state.lastContinuationPoint = nextContinuation;
  state.queueRemaining = Math.max(0, state.totalPositionsAvailable - nextContinuation);
  state.estimatedRemainingPositions = state.queueRemaining;
  state.hydrationPercent =
    state.totalPositionsAvailable > 0
      ? Math.min(100, Math.round((nextContinuation / state.totalPositionsAvailable) * 100))
      : 100;

  for (const id of input.completedPositionIds) {
    if (!state.completedPositionIds.includes(id)) state.completedPositionIds.push(id);
  }
  for (const id of input.skippedPositionIds) {
    if (!state.skippedPositionIds.includes(id)) state.skippedPositionIds.push(id);
  }

  state.candidateCountAtLastSuccess = Math.max(state.candidateCountAtLastSuccess, input.candidateCount);
  state.lastSuccessfulHydrationAt = nowIso();
  state.hydrationHeartbeat = nowIso();
  state.expiresAt = Date.now() + BREEZY_HYDRATION_STATE_TTL_MS;
  state.hydrationComplete =
    nextContinuation >= state.totalPositionsAvailable && state.totalPositionsAvailable > 0 && !input.truncated;

  if (state.hydrationComplete) {
    state.hydrationInProgress = false;
    state.hydrationOwnerId = null;
  }

  logBreezyCandidatesOps("server", "success", {
    phase: "hydration_progress",
    companyId: input.companyId,
    hydrationRoundId: state.hydrationRoundId,
    positionsScanned: state.positionsScanned,
    queueRemaining: state.queueRemaining,
    hydrationPercent: state.hydrationPercent,
    resumeCount: state.resumeCount,
    restartCount: state.restartCount,
    lastContinuationPoint: state.lastContinuationPoint,
  });

  return state;
}

export function mergeHydrationJobSnapshots(
  base?: BreezyHydrationJobSnapshot | null,
  addition?: BreezyHydrationJobSnapshot | null,
): BreezyHydrationJobSnapshot | undefined {
  if (!base && !addition) return undefined;
  if (!base) return addition ?? undefined;
  if (!addition) return base;
  if (addition.lastContinuationPoint >= base.lastContinuationPoint) return addition;
  if (addition.candidateCountAtLastSuccess > base.candidateCountAtLastSuccess) {
    return { ...base, candidateCountAtLastSuccess: addition.candidateCountAtLastSuccess };
  }
  return base;
}

/** Client-stable owner id for hydration lock ownership within a browser session. */
export function createHydrationOwnerId(): string {
  if (typeof window === "undefined") return newHydrationId();
  const key = "breezy:candidates:hydrationOwner:v1";
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created = newHydrationId();
    sessionStorage.setItem(key, created);
    return created;
  } catch {
    return newHydrationId();
  }
}

const CLIENT_HYDRATION_BACKUP_KEY = "breezy:candidates:hydrationProgress:v1";

export function persistClientHydrationBackup(snapshot: BreezyHydrationJobSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    const priorRaw = sessionStorage.getItem(CLIENT_HYDRATION_BACKUP_KEY);
    if (priorRaw) {
      const prior = JSON.parse(priorRaw) as BreezyHydrationJobSnapshot;
      if (prior.lastContinuationPoint > snapshot.lastContinuationPoint) return;
      if (
        prior.lastContinuationPoint === snapshot.lastContinuationPoint &&
        prior.candidateCountAtLastSuccess > snapshot.candidateCountAtLastSuccess
      ) {
        return;
      }
    }
    sessionStorage.setItem(CLIENT_HYDRATION_BACKUP_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore quota / private mode
  }
}

export function readClientHydrationBackup(): BreezyHydrationJobSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CLIENT_HYDRATION_BACKUP_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BreezyHydrationJobSnapshot;
  } catch {
    return null;
  }
}

export function resolveClientHydrationResumeOffset(
  snapshot: { positionsScanned?: number; hydrationJob?: BreezyHydrationJobSnapshot | null },
): number {
  const backup = readClientHydrationBackup();
  return Math.max(
    snapshot.hydrationJob?.lastContinuationPoint ?? 0,
    snapshot.hydrationJob?.positionsScanned ?? 0,
    backup?.lastContinuationPoint ?? 0,
    backup?.positionsScanned ?? 0,
    snapshot.positionsScanned ?? 0,
  );
}

export function shouldSkipFastTierForActiveHydration(input: {
  candidateCount: number;
  hydrationJob?: BreezyHydrationJobSnapshot | null;
  positionsScanned?: number;
  fastTierSize?: number;
}): boolean {
  const fastTierSize = input.fastTierSize ?? 60;
  const continuation = resolveClientHydrationResumeOffset({
    positionsScanned: input.positionsScanned,
    hydrationJob: input.hydrationJob,
  });
  return continuation >= fastTierSize && input.candidateCount > 0;
}
