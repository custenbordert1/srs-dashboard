import type { BreezyCandidatesScanMode } from "@/lib/breezy-api";
import { computeHydrationThroughput } from "@/lib/breezy-hydration-throughput";
import { logBreezyCandidatesOps } from "@/lib/breezy-candidates-ops-log";

function newHydrationId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `hydration-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Heartbeat older than this — owner is considered dead. */
export const BREEZY_HYDRATION_HEARTBEAT_STALE_MS = 60_000;
/** No continuation/candidate progress for this long → stalled. */
export const BREEZY_HYDRATION_PROGRESS_STALE_MS = 45_000;
/** Client in-flight full hydration older than this can be superseded by Refresh. */
export const BREEZY_HYDRATION_INFLIGHT_STALE_MS = 90_000;
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
  lastProgressAt: string | null;
  lastCandidateIncreaseAt: string | null;
  lastContinuationIncreaseAt: string | null;
  lastUpdatedAt: string | null;
  reclaimCount: number;
  hydrationStalled: boolean;
  hydrationRoundsCompleted: number;
  candidatesAddedLastRound: number;
  positionsCompletedLastRound: number;
  lastRoundDurationMs: number | null;
  lastSuccessfulPositionId: string | null;
  consecutiveTimeouts: number;
  rateLimitBackoffActive: boolean;
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
  reclaimed: boolean;
  stalled: boolean;
};

export type HydrationContinuationResult = HydrationResumePlan & {
  hydrationJob: BreezyHydrationJobState | null;
};

const hydrationJobs = new Map<string, BreezyHydrationJobState>();

function hydrationKey(companyId: string): string {
  return companyId.trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function isHeartbeatStale(state: BreezyHydrationJobState, now = Date.now()): boolean {
  const heartbeatMs = parseMs(state.hydrationHeartbeat);
  if (heartbeatMs === null) return state.hydrationInProgress;
  return now - heartbeatMs > BREEZY_HYDRATION_HEARTBEAT_STALE_MS;
}

function isProgressStale(state: BreezyHydrationJobState, now = Date.now()): boolean {
  if (!state.hydrationInProgress || state.hydrationComplete) return false;
  const progressMs = parseMs(state.lastProgressAt ?? state.lastSuccessfulHydrationAt ?? state.startedAt);
  if (progressMs === null) return true;
  return now - progressMs > BREEZY_HYDRATION_PROGRESS_STALE_MS;
}

export function isHydrationJobStalled(state: BreezyHydrationJobState, now = Date.now()): boolean {
  if (state.hydrationComplete) return false;
  if (!state.hydrationInProgress) return false;
  return isHeartbeatStale(state, now) || isProgressStale(state, now);
}

function touchProgressTimestamps(
  state: BreezyHydrationJobState,
  input: {
    candidateCount?: number;
    continuationPoint?: number;
    heartbeat?: boolean;
  },
): void {
  const now = nowIso();
  state.lastProgressAt = now;
  state.lastUpdatedAt = now;
  if (input.heartbeat !== false) {
    state.hydrationHeartbeat = now;
  }
  if (
    input.candidateCount !== undefined &&
    input.candidateCount > state.candidateCountAtLastSuccess
  ) {
    state.candidateCountAtLastSuccess = input.candidateCount;
    state.lastCandidateIncreaseAt = now;
  }
  if (
    input.continuationPoint !== undefined &&
    input.continuationPoint > (state.lastContinuationPoint ?? 0)
  ) {
    state.lastContinuationPoint = input.continuationPoint;
    state.lastContinuationIncreaseAt = now;
  }
  state.expiresAt = Date.now() + BREEZY_HYDRATION_STATE_TTL_MS;
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
    lastProgressAt: null,
    lastCandidateIncreaseAt: null,
    lastContinuationIncreaseAt: null,
    lastUpdatedAt: nowIso(),
    reclaimCount: prior?.reclaimCount ?? 0,
    hydrationStalled: false,
    hydrationRoundsCompleted: prior?.hydrationRoundsCompleted ?? 0,
    candidatesAddedLastRound: 0,
    positionsCompletedLastRound: 0,
    lastRoundDurationMs: null,
    lastSuccessfulPositionId: prior?.lastSuccessfulPositionId ?? null,
    consecutiveTimeouts: 0,
    rateLimitBackoffActive: false,
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

export function forceReleaseHydrationLock(companyId: string, reason: string): BreezyHydrationJobState | null {
  const state = getHydrationJobState(companyId);
  if (!state) return null;
  state.hydrationInProgress = false;
  state.hydrationOwnerId = null;
  state.hydrationStalled = true;
  state.lastUpdatedAt = nowIso();
  state.expiresAt = Date.now() + BREEZY_HYDRATION_STATE_TTL_MS;
  hydrationJobs.set(hydrationKey(companyId), state);
  logBreezyCandidatesOps("server", "fallback", {
    phase: "hydration_lock_released",
    companyId: hydrationKey(companyId),
    reason,
    lastContinuationPoint: state.lastContinuationPoint,
  });
  return state;
}

export function reclaimStalledHydrationJob(
  companyId: string,
  newOwnerId: string,
  reason: string,
): BreezyHydrationJobState | null {
  const key = hydrationKey(companyId);
  const state = getHydrationJobState(key);
  if (!state) return null;

  const continuation = state.lastContinuationPoint;
  state.hydrationInProgress = false;
  state.hydrationOwnerId = null;
  state.hydrationStalled = true;
  state.reclaimCount += 1;
  state.resumeCount += 1;
  touchProgressTimestamps(state, { continuationPoint: continuation, heartbeat: true });
  state.hydrationStalled = false;
  state.hydrationInProgress = true;
  state.hydrationOwnerId = newOwnerId;
  state.hydrationStartedAt = state.hydrationStartedAt ?? nowIso();
  hydrationJobs.set(key, state);

  logBreezyCandidatesOps("server", "fallback", {
    phase: "hydration_reclaim",
    companyId: key,
    reason,
    newOwnerId,
    hydrationRoundId: state.hydrationRoundId,
    lastContinuationPoint: continuation,
    reclaimCount: state.reclaimCount,
    resumeCount: state.resumeCount,
  });

  return state;
}

export function prepareHydrationContinuation(input: {
  companyId: string;
  ownerId: string;
  totalPositionsAvailable: number;
  requestedOffset?: number;
  force?: boolean;
  reclaimStale?: boolean;
  seedContinuationPoint?: number;
  seedCandidateCount?: number;
}): HydrationContinuationResult {
  const key = hydrationKey(input.companyId);
  if (input.force) {
    resetHydrationJobState(key, "hard_reset_requested");
  }

  let state = getHydrationJobState(key);
  let reclaimed = false;
  const now = Date.now();

  if (state && !input.force) {
    const stalled = isHydrationJobStalled(state, now);
    const shouldReclaim =
      Boolean(input.reclaimStale) ||
      stalled ||
      (state.hydrationInProgress &&
        state.hydrationOwnerId !== input.ownerId &&
        (isHeartbeatStale(state, now) || isProgressStale(state, now)));

    if (shouldReclaim) {
      reclaimStalledHydrationJob(input.companyId, input.ownerId, stalled ? "stalled_job" : "reclaim_requested");
      reclaimed = true;
      state = getHydrationJobState(key);
    }
  }

  const plan = beginHydrationSession({
    companyId: input.companyId,
    ownerId: input.ownerId,
    totalPositionsAvailable: input.totalPositionsAvailable,
    seedContinuationPoint: Math.max(
      input.seedContinuationPoint ?? 0,
      input.requestedOffset ?? 0,
      state?.lastContinuationPoint ?? 0,
    ),
    seedCandidateCount: input.seedCandidateCount,
    force: false,
  });

  return {
    ...plan,
    reclaimed,
    stalled: state ? isHydrationJobStalled(state, now) : false,
    hydrationJob: getHydrationJobState(key),
  };
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
      lastProgressAt: seed > 0 ? nowIso() : null,
      lastCandidateIncreaseAt: (input.seedCandidateCount ?? 0) > 0 ? nowIso() : null,
      lastContinuationIncreaseAt: seed > 0 ? nowIso() : null,
      lastUpdatedAt: nowIso(),
      reclaimCount: 0,
      hydrationStalled: false,
      hydrationRoundsCompleted: 0,
      candidatesAddedLastRound: 0,
      positionsCompletedLastRound: 0,
      lastRoundDurationMs: null,
      lastSuccessfulPositionId: null,
      consecutiveTimeouts: 0,
      rateLimitBackoffActive: false,
      expiresAt: now + BREEZY_HYDRATION_STATE_TTL_MS,
    };
    hydrationJobs.set(key, state);
    return {
      hydrationRoundId: state.hydrationRoundId,
      resumeOffset: seed,
      attachedToExisting: false,
      resumedFromStale: false,
      restarted: Boolean(input.force),
      reclaimed: false,
      stalled: false,
    };
  }

  const seedContinuation = Math.max(0, input.seedContinuationPoint ?? 0);
  if (seedContinuation > state.lastContinuationPoint) {
    state.lastContinuationPoint = seedContinuation;
    state.positionsScanned = seedContinuation;
    state.queueRemaining = Math.max(0, state.totalPositionsAvailable - seedContinuation);
    state.estimatedRemainingPositions = state.queueRemaining;
    state.hydrationPercent =
      state.totalPositionsAvailable > 0
        ? Math.min(100, Math.round((seedContinuation / state.totalPositionsAvailable) * 100))
        : state.hydrationPercent;
    if (seedContinuation > 0) {
      state.lastSuccessfulHydrationAt = state.lastSuccessfulHydrationAt ?? nowIso();
    }
  }
  if (input.seedCandidateCount !== undefined) {
    state.candidateCountAtLastSuccess = Math.max(
      state.candidateCountAtLastSuccess,
      input.seedCandidateCount,
    );
  }

  const stale = isHydrationJobStalled(state, now);
  const attachedToExisting =
    state.hydrationInProgress && !stale && state.hydrationOwnerId === input.ownerId;
  const resumedFromStale = stale;

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
      reclaimed: false,
      stalled: false,
    };
  }

  if (stale) {
    state.hydrationInProgress = false;
    state.hydrationOwnerId = null;
    state.hydrationStalled = true;
  }

  state.totalPositionsAvailable = Math.max(state.totalPositionsAvailable, input.totalPositionsAvailable);
  state.hydrationInProgress = true;
  state.hydrationOwnerId = input.ownerId;
  state.hydrationStalled = false;
  touchProgressTimestamps(state, { heartbeat: true });
  state.hydrationStartedAt = state.hydrationStartedAt ?? nowIso();
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
    reclaimed: resumedFromStale,
    stalled: stale,
  };
}

export function touchHydrationHeartbeat(companyId: string, ownerId: string): void {
  const state = getHydrationJobState(companyId);
  if (!state) return;
  if (state.hydrationOwnerId && state.hydrationOwnerId !== ownerId && !isHydrationJobStalled(state)) {
    return;
  }
  if (state.hydrationOwnerId !== ownerId) {
    state.hydrationOwnerId = ownerId;
    state.hydrationInProgress = true;
    state.hydrationStalled = false;
  }
  touchProgressTimestamps(state, { heartbeat: true });
}

export function releaseHydrationSession(companyId: string, ownerId: string, complete = false): void {
  const state = getHydrationJobState(companyId);
  if (!state) return;
  if (state.hydrationOwnerId && state.hydrationOwnerId !== ownerId && !isHydrationJobStalled(state)) {
    return;
  }
  state.hydrationInProgress = false;
  state.hydrationOwnerId = null;
  state.hydrationComplete = complete || state.hydrationComplete;
  state.hydrationStalled = false;
  state.lastUpdatedAt = nowIso();
  state.expiresAt = Date.now() + BREEZY_HYDRATION_STATE_TTL_MS;
}

export function resolveHydrationResumeOffset(input: {
  companyId: string;
  ownerId: string;
  totalPositionsAvailable: number;
  requestedOffset?: number;
  force?: boolean;
  reclaimStale?: boolean;
  seedContinuationPoint?: number;
  seedCandidateCount?: number;
}): HydrationResumePlan {
  const result = prepareHydrationContinuation(input);
  return {
    hydrationRoundId: result.hydrationRoundId,
    resumeOffset: result.resumeOffset,
    attachedToExisting: result.attachedToExisting,
    resumedFromStale: result.resumedFromStale,
    restarted: result.restarted,
    reclaimed: result.reclaimed,
    stalled: result.stalled,
  };
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
  roundDurationMs?: number;
  rateLimitHit?: boolean;
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
  const priorCandidateCount = state.candidateCountAtLastSuccess;
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

  const positionsCompletedThisRound = Math.max(0, nextContinuation - priorContinuation);
  const candidatesAddedThisRound = Math.max(0, input.candidateCount - priorCandidateCount);

  state.hydrationRoundsCompleted += 1;
  state.positionsCompletedLastRound = positionsCompletedThisRound;
  state.candidatesAddedLastRound = candidatesAddedThisRound;
  state.lastRoundDurationMs = input.roundDurationMs ?? state.lastRoundDurationMs;
  state.lastSuccessfulPositionId =
    input.completedPositionIds[input.completedPositionIds.length - 1] ??
    state.lastSuccessfulPositionId;
  if (input.truncated) {
    state.consecutiveTimeouts += 1;
  } else {
    state.consecutiveTimeouts = 0;
  }
  state.rateLimitBackoffActive = Boolean(input.rateLimitHit);

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
  touchProgressTimestamps(state, {
    candidateCount: input.candidateCount,
    continuationPoint: nextContinuation,
    heartbeat: true,
  });
  state.hydrationComplete =
    nextContinuation >= state.totalPositionsAvailable && state.totalPositionsAvailable > 0 && !input.truncated;

  if (state.hydrationComplete) {
    state.hydrationInProgress = false;
    state.hydrationOwnerId = null;
    state.hydrationStalled = false;
  }

  const throughput = computeHydrationThroughput({
    state,
    truncated: input.truncated,
    rateLimitHit: input.rateLimitHit,
  });

  logBreezyCandidatesOps("server", "success", {
    phase: "hydration_progress",
    companyId: input.companyId,
    hydrationRoundId: state.hydrationRoundId,
    positionsScanned: state.positionsScanned,
    queueRemaining: state.queueRemaining,
    hydrationPercent: state.hydrationPercent,
    resumeCount: state.resumeCount,
    restartCount: state.restartCount,
    reclaimCount: state.reclaimCount,
    lastContinuationPoint: state.lastContinuationPoint,
    lastProgressAt: state.lastProgressAt,
    hydrationRoundsCompleted: throughput.hydrationRoundsCompleted,
    candidatesAddedPerRound: throughput.candidatesAddedPerRound,
    positionsCompletedPerMinute: throughput.positionsCompletedPerMinute,
    queueDrainRate: throughput.queueDrainRate,
    estimatedTimeToCompleteMs: throughput.estimatedTimeToCompleteMs,
    hydrationIdleReason: throughput.hydrationIdleReason,
    consecutiveTimeouts: throughput.consecutiveTimeouts,
    rateLimitBackoffActive: throughput.rateLimitBackoffActive,
    lastSuccessfulPositionId: throughput.lastSuccessfulPositionId,
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
