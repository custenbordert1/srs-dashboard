/**
 * P165 — Process-local Dropbox Sign API metrics for executive observability.
 */

export type DropboxSignApiMetricsSnapshot = {
  postRequests: number;
  getRequests: number;
  totalRequests: number;
  requestsPerMinute: number;
  rateLimitRemaining: number | null;
  rateLimitResetAt: string | null;
  retries: number;
  responses429: number;
  averageLatencyMs: number | null;
  cacheHits: number;
  cacheMisses: number;
  executionScopeDedupes: number;
  rateLimitedPausedMs: number;
  observedAt: string;
};

type MetricsState = {
  postRequests: number;
  getRequests: number;
  latenciesMs: number[];
  retries: number;
  responses429: number;
  cacheHits: number;
  cacheMisses: number;
  executionScopeDedupes: number;
  rateLimitedPausedMs: number;
  rateLimitRemaining: number | null;
  rateLimitResetAt: string | null;
  requestTimestamps: number[];
};

function createState(): MetricsState {
  return {
    postRequests: 0,
    getRequests: 0,
    latenciesMs: [],
    retries: 0,
    responses429: 0,
    cacheHits: 0,
    cacheMisses: 0,
    executionScopeDedupes: 0,
    rateLimitedPausedMs: 0,
    rateLimitRemaining: null,
    rateLimitResetAt: null,
    requestTimestamps: [],
  };
}

const state: MetricsState = createState();

function pruneTimestamps(now: number): void {
  const cutoff = now - 60_000;
  state.requestTimestamps = state.requestTimestamps.filter((t) => t >= cutoff);
}

export function recordDropboxApiRequest(input: {
  method: "GET" | "POST";
  latencyMs: number;
  status?: number;
  rateLimitRemaining?: number | null;
  rateLimitResetUnix?: number | null;
}): void {
  const now = Date.now();
  if (input.method === "POST") state.postRequests += 1;
  else state.getRequests += 1;

  state.latenciesMs.push(input.latencyMs);
  if (state.latenciesMs.length > 200) state.latenciesMs.shift();

  state.requestTimestamps.push(now);
  pruneTimestamps(now);

  if (input.status === 429) state.responses429 += 1;

  if (input.rateLimitRemaining != null && Number.isFinite(input.rateLimitRemaining)) {
    state.rateLimitRemaining = input.rateLimitRemaining;
  }
  if (input.rateLimitResetUnix != null && Number.isFinite(input.rateLimitResetUnix)) {
    state.rateLimitResetAt = new Date(input.rateLimitResetUnix * 1000).toISOString();
  }
}

export function recordDropboxRetry(): void {
  state.retries += 1;
}

export function recordDropboxCacheHit(): void {
  state.cacheHits += 1;
}

export function recordDropboxCacheMiss(): void {
  state.cacheMisses += 1;
}

export function recordDropboxExecutionScopeDedupe(): void {
  state.executionScopeDedupes += 1;
}

export function recordDropboxRateLimitPause(ms: number): void {
  state.rateLimitedPausedMs += ms;
}

export function getDropboxSignApiMetricsSnapshot(): DropboxSignApiMetricsSnapshot {
  const now = Date.now();
  pruneTimestamps(now);
  const total = state.postRequests + state.getRequests;
  const avg =
    state.latenciesMs.length > 0
      ? Math.round(state.latenciesMs.reduce((a, b) => a + b, 0) / state.latenciesMs.length)
      : null;

  return {
    postRequests: state.postRequests,
    getRequests: state.getRequests,
    totalRequests: total,
    requestsPerMinute: state.requestTimestamps.length,
    rateLimitRemaining: state.rateLimitRemaining,
    rateLimitResetAt: state.rateLimitResetAt,
    retries: state.retries,
    responses429: state.responses429,
    averageLatencyMs: avg,
    cacheHits: state.cacheHits,
    cacheMisses: state.cacheMisses,
    executionScopeDedupes: state.executionScopeDedupes,
    rateLimitedPausedMs: state.rateLimitedPausedMs,
    observedAt: new Date().toISOString(),
  };
}

/** Test-only reset. */
export function resetDropboxSignApiMetrics(): void {
  const fresh = createState();
  Object.assign(state, fresh);
}
