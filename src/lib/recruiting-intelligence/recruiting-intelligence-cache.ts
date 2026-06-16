import {
  buildRecruitingIntelligenceSnapshot,
  buildRecruitingIntelligenceSnapshotFromWarmCaches,
} from "@/lib/recruiting-intelligence/build-recruiting-intelligence-snapshot";
import type {
  CachedRecruitingIntelligenceResponse,
  GetCachedRecruitingIntelligenceOptions,
  RecruitingIntelligenceCacheDiagnostics,
  RecruitingIntelligenceCacheMeta,
  RecruitingIntelligenceCacheStatus,
  RecruitingIntelligenceSnapshot,
} from "@/lib/recruiting-intelligence/recruiting-intelligence-types";

export const RECRUITING_INTELLIGENCE_CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  snapshot: RecruitingIntelligenceSnapshot;
  expiresAt: number;
  refreshPromise: Promise<RecruitingIntelligenceSnapshot> | null;
};

let cacheEntry: CacheEntry | null = null;
let globalRefreshPromise: Promise<RecruitingIntelligenceSnapshot> | null = null;
let hitCount = 0;
let missCount = 0;
let staleServeCount = 0;
let warmServeCount = 0;

function formatAgeLabel(ageMs: number | null): string {
  if (ageMs == null) return "—";
  if (ageMs < 1000) return `${ageMs}ms`;
  if (ageMs < 60_000) return `${Math.round(ageMs / 1000)}s`;
  return `${Math.round(ageMs / 60_000)}m`;
}

function buildCacheMeta(
  snapshot: RecruitingIntelligenceSnapshot,
  status: RecruitingIntelligenceCacheStatus,
  backgroundRefresh: boolean,
): RecruitingIntelligenceCacheMeta {
  const snapshotAgeMs = Math.max(0, Date.now() - new Date(snapshot.builtAt).getTime());
  return {
    cacheStatus: status,
    snapshotAgeMs,
    isStale: status === "stale-serving" || status === "refreshing" || status === "warm-serving",
    backgroundRefresh,
    lastRefreshAt: snapshot.fetchedAt,
    recordCounts: {
      jobCount: snapshot.metrics.jobCount,
      candidateCount: snapshot.metrics.candidateCount,
      opportunityCount: snapshot.metrics.opportunityCount,
      workflowCount: snapshot.metrics.workflowCount,
    },
  };
}

async function refreshCacheEntry(): Promise<RecruitingIntelligenceSnapshot> {
  const snapshot = await buildRecruitingIntelligenceSnapshot();
  cacheEntry = {
    snapshot,
    expiresAt: Date.now() + RECRUITING_INTELLIGENCE_CACHE_TTL_MS,
    refreshPromise: null,
  };
  return snapshot;
}

function startFullRefresh(): Promise<RecruitingIntelligenceSnapshot> {
  if (globalRefreshPromise) return globalRefreshPromise;
  const promise = refreshCacheEntry()
    .catch((error) => {
      console.error("[recruiting-intelligence-cache] refresh failed", error);
      if (cacheEntry) return cacheEntry.snapshot;
      return buildRecruitingIntelligenceSnapshotFromWarmCaches();
    })
    .finally(() => {
      globalRefreshPromise = null;
      if (cacheEntry) cacheEntry.refreshPromise = null;
    });
  globalRefreshPromise = promise;
  if (cacheEntry) cacheEntry.refreshPromise = promise;
  return promise;
}

function startBackgroundRefresh(): void {
  if (globalRefreshPromise) return;
  void startFullRefresh();
}

async function serveWarmCacheSnapshot(): Promise<RecruitingIntelligenceSnapshot> {
  const warm = await buildRecruitingIntelligenceSnapshotFromWarmCaches(cacheEntry?.snapshot ?? null);
  warmServeCount += 1;
  cacheEntry = {
    snapshot: warm,
    expiresAt: Date.now(),
    refreshPromise: null,
  };
  startBackgroundRefresh();
  return warm;
}

export async function getCachedRecruitingIntelligenceSnapshot(
  options: GetCachedRecruitingIntelligenceOptions = {},
): Promise<CachedRecruitingIntelligenceResponse> {
  const now = Date.now();

  if (options.forceRefresh) {
    missCount += 1;
    const snapshot = await startFullRefresh();
    return {
      snapshot,
      meta: buildCacheMeta(snapshot, "fresh", false),
    };
  }

  if (!cacheEntry) {
    if (options.preferCache) {
      const warm = await serveWarmCacheSnapshot();
      return {
        snapshot: warm,
        meta: buildCacheMeta(warm, "warm-serving", true),
      };
    }

    missCount += 1;
    const snapshot = await startFullRefresh();
    return {
      snapshot,
      meta: buildCacheMeta(snapshot, options.preferCache ? "refreshing" : "miss", Boolean(options.preferCache)),
    };
  }

  const isFresh = cacheEntry.expiresAt > now;

  if (isFresh) {
    hitCount += 1;
    return {
      snapshot: cacheEntry.snapshot,
      meta: buildCacheMeta(
        cacheEntry.snapshot,
        "fresh",
        Boolean(cacheEntry.refreshPromise || globalRefreshPromise),
      ),
    };
  }

  staleServeCount += 1;
  startBackgroundRefresh();
  return {
    snapshot: cacheEntry.snapshot,
    meta: buildCacheMeta(
      cacheEntry.snapshot,
      cacheEntry.refreshPromise || globalRefreshPromise ? "refreshing" : "stale-serving",
      true,
    ),
  };
}

export function getRecruitingIntelligenceCacheDiagnostics(): RecruitingIntelligenceCacheDiagnostics {
  const now = Date.now();
  const snapshot = cacheEntry?.snapshot ?? null;
  const snapshotAgeMs = snapshot ? Math.max(0, now - new Date(snapshot.builtAt).getTime()) : null;
  const isStale = cacheEntry ? cacheEntry.expiresAt <= now : false;

  let cacheStatus: RecruitingIntelligenceCacheStatus = "empty";
  if (snapshot && isStale && (cacheEntry?.refreshPromise || globalRefreshPromise)) {
    cacheStatus = "refreshing";
  } else if (snapshot && isStale) cacheStatus = "stale-serving";
  else if (snapshot) cacheStatus = "fresh";

  return {
    cacheStatus,
    snapshotAgeMs,
    snapshotAgeLabel: formatAgeLabel(snapshotAgeMs),
    lastRefreshAt: snapshot?.fetchedAt ?? null,
    lastBuiltAt: snapshot?.builtAt ?? null,
    ttlMs: RECRUITING_INTELLIGENCE_CACHE_TTL_MS,
    isStale,
    backgroundRefreshInFlight: Boolean(cacheEntry?.refreshPromise || globalRefreshPromise),
    hitCount,
    missCount,
    staleServeCount,
    recordCounts: snapshot?.metrics ?? null,
  };
}

export function clearRecruitingIntelligenceCache(): void {
  cacheEntry = null;
  globalRefreshPromise = null;
}

export function __resetRecruitingIntelligenceCacheForTests(): void {
  cacheEntry = null;
  globalRefreshPromise = null;
  hitCount = 0;
  missCount = 0;
  staleServeCount = 0;
  warmServeCount = 0;
}

export function __setRecruitingIntelligenceCacheForTests(
  snapshot: RecruitingIntelligenceSnapshot,
  options?: { expired?: boolean },
): void {
  cacheEntry = {
    snapshot,
    expiresAt: Date.now() + (options?.expired ? -1 : RECRUITING_INTELLIGENCE_CACHE_TTL_MS),
    refreshPromise: null,
  };
}

export function __getWarmServeCountForTests(): number {
  return warmServeCount;
}
