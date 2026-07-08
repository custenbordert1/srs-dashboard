/**
 * P161.1 — In-memory performance metrics registry.
 *
 * Tracks cache hit/miss rates, snapshot build timings, per-function durations,
 * filesystem reads, and workflow scans so we can prove the snapshot layer is
 * actually serving cached data instead of recomputing on every request.
 *
 * This is a process-local singleton. It intentionally holds no PII and performs
 * no I/O — it is safe to import from hot request paths and leaf loaders.
 */

export type P1611FunctionTiming = {
  label: string;
  count: number;
  totalMs: number;
  lastMs: number;
  maxMs: number;
};

export type P1611MetricsSnapshot = {
  cacheHits: number;
  cacheMisses: number;
  cacheHitRatePct: number;
  cacheMissRatePct: number;
  backgroundRefreshes: number;
  backgroundRefreshFailures: number;
  lastSnapshotBuildMs: number | null;
  avgSnapshotBuildMs: number | null;
  filesystemReads: number;
  workflowScans: number;
  functionTimings: P1611FunctionTiming[];
  longestFunction: P1611FunctionTiming | null;
  observedAt: string;
};

type MetricsState = {
  cacheHits: number;
  cacheMisses: number;
  backgroundRefreshes: number;
  backgroundRefreshFailures: number;
  snapshotBuildMs: number[];
  filesystemReads: number;
  workflowScans: number;
  functionTimings: Map<string, P1611FunctionTiming>;
};

function createState(): MetricsState {
  return {
    cacheHits: 0,
    cacheMisses: 0,
    backgroundRefreshes: 0,
    backgroundRefreshFailures: 0,
    snapshotBuildMs: [],
    filesystemReads: 0,
    workflowScans: 0,
    functionTimings: new Map(),
  };
}

const state: MetricsState = createState();

export function recordCacheHit(): void {
  state.cacheHits += 1;
}

export function recordCacheMiss(): void {
  state.cacheMisses += 1;
}

export function recordBackgroundRefresh(success: boolean): void {
  state.backgroundRefreshes += 1;
  if (!success) state.backgroundRefreshFailures += 1;
}

export function recordSnapshotBuild(ms: number): void {
  state.snapshotBuildMs.push(ms);
  if (state.snapshotBuildMs.length > 50) state.snapshotBuildMs.shift();
}

export function incrementFilesystemReads(n = 1): void {
  state.filesystemReads += n;
}

export function incrementWorkflowScans(n = 1): void {
  state.workflowScans += n;
}

export function recordFunctionTiming(label: string, ms: number): void {
  const existing = state.functionTimings.get(label);
  if (existing) {
    existing.count += 1;
    existing.totalMs += ms;
    existing.lastMs = ms;
    existing.maxMs = Math.max(existing.maxMs, ms);
  } else {
    state.functionTimings.set(label, {
      label,
      count: 1,
      totalMs: ms,
      lastMs: ms,
      maxMs: ms,
    });
  }
}

/** Times an async function and records the duration under `label`. */
export async function timeFunction<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    recordFunctionTiming(label, Date.now() - start);
  }
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

export function getMetricsSnapshot(): P1611MetricsSnapshot {
  const total = state.cacheHits + state.cacheMisses;
  const builds = state.snapshotBuildMs;
  const lastSnapshotBuildMs = builds.length > 0 ? builds[builds.length - 1] : null;
  const avgSnapshotBuildMs =
    builds.length > 0 ? Math.round(builds.reduce((a, b) => a + b, 0) / builds.length) : null;

  const functionTimings = [...state.functionTimings.values()].sort((a, b) => b.maxMs - a.maxMs);

  return {
    cacheHits: state.cacheHits,
    cacheMisses: state.cacheMisses,
    cacheHitRatePct: pct(state.cacheHits, total),
    cacheMissRatePct: pct(state.cacheMisses, total),
    backgroundRefreshes: state.backgroundRefreshes,
    backgroundRefreshFailures: state.backgroundRefreshFailures,
    lastSnapshotBuildMs,
    avgSnapshotBuildMs,
    filesystemReads: state.filesystemReads,
    workflowScans: state.workflowScans,
    functionTimings,
    longestFunction: functionTimings[0] ?? null,
    observedAt: new Date().toISOString(),
  };
}

/** Test-only reset. */
export function resetMetrics(): void {
  const fresh = createState();
  state.cacheHits = fresh.cacheHits;
  state.cacheMisses = fresh.cacheMisses;
  state.backgroundRefreshes = fresh.backgroundRefreshes;
  state.backgroundRefreshFailures = fresh.backgroundRefreshFailures;
  state.snapshotBuildMs = fresh.snapshotBuildMs;
  state.filesystemReads = fresh.filesystemReads;
  state.workflowScans = fresh.workflowScans;
  state.functionTimings = fresh.functionTimings;
}
