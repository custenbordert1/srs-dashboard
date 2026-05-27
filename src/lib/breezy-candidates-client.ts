import type { BreezyCandidatesResult, BreezyCandidatesScanMode, BreezyCandidatesSuccess } from "@/lib/breezy-api";
import {
  isBreezyCandidatesTimeoutMessage,
  logBreezyCandidatesOps,
} from "@/lib/breezy-candidates-ops-log";
import { logCandidatesClientTrace } from "@/lib/candidates-client-trace";
import { logCandidatesDebug, logFirstCandidateKeys } from "@/lib/candidates-debug";
import {
  BREEZY_CANDIDATES_SOURCE,
  hasPopulatedCandidatesSnapshot,
  mergeCandidatesSnapshots,
  timeoutShowsCachedCandidatesMessage,
  withCandidatesFailureMeta,
  withCandidatesSyncMeta,
} from "@/lib/breezy-candidates-sync";
import {
  logCandidatesCacheWriteDecision,
  pickRichestCandidatesSnapshot,
  shouldAcceptCandidatesCacheWrite,
} from "@/lib/breezy-candidates-cache";
import {
  createHydrationOwnerId,
  persistClientHydrationBackup,
  readClientHydrationBackup,
  resolveClientHydrationResumeOffset,
  shouldSkipFastTierForActiveHydration,
} from "@/lib/breezy-candidates-hydration";
import {
  cacheKey,
  fetchCachedJson,
  getCached,
  getCachedAllowExpired,
  invalidateCached,
  LONG_CLIENT_CACHE_TTL_MS,
} from "@/lib/client-api-cache";
import {
  BREEZY_CANDIDATES_FAST_CLIENT_TIMEOUT_MS,
  BREEZY_CANDIDATES_FULL_HYDRATION_TIMEOUT_MS,
  BREEZY_CANDIDATES_PREVIEW_CLIENT_TIMEOUT_MS,
  fetchWithTimeout,
  isTimeoutError,
} from "@/lib/fetch-with-timeout";

/** Preview tier — must cover server preview budget (~18s) + jobs list fetch + Breezy latency. */
export const CANDIDATES_PREVIEW_CLIENT_TIMEOUT_MS = BREEZY_CANDIDATES_PREVIEW_CLIENT_TIMEOUT_MS;
/** Fast-tier scan (60 positions) — must not abort before server can return populated rows. */
export const CANDIDATES_FAST_CLIENT_TIMEOUT_MS = BREEZY_CANDIDATES_FAST_CLIENT_TIMEOUT_MS;
/** Candidates tab loading ceiling — wait through preview + fast before timeout messaging. */
export const CANDIDATES_TAB_LOADING_CEILING_MS = CANDIDATES_FAST_CLIENT_TIMEOUT_MS + 5_000;
/** @deprecated Use CANDIDATES_FAST_CLIENT_TIMEOUT_MS */
export const CANDIDATES_BREEZY_CLIENT_TIMEOUT_MS = CANDIDATES_FAST_CLIENT_TIMEOUT_MS;
/** Full-tier hydration can exceed the fast-tier client ceiling. */
export const CANDIDATES_FULL_HYDRATION_TIMEOUT_MS = BREEZY_CANDIDATES_FULL_HYDRATION_TIMEOUT_MS;
/** Max incremental full-tier rounds (295 positions / ~115s budget per round). */
const MAX_FULL_HYDRATION_ROUNDS = 6;
let fullHydrationInflight: Promise<CandidatesTabFetchResult> | null = null;
const hydrationOwnerId = typeof window !== "undefined" ? createHydrationOwnerId() : "server-tab";
/** Client cache TTL for preview responses (populated snapshots only). */
export const CANDIDATES_PREVIEW_CACHE_TTL_MS = 300_000;

const TAB_PREVIEW_CACHE_KEY = cacheKey(["breezy", "candidates", "tab", "preview", "v1"]);
const TAB_FAST_CACHE_KEY = cacheKey(["breezy", "candidates", "tab", "fast", "v1"]);
const TAB_FULL_CACHE_KEY = cacheKey(["breezy", "candidates", "tab", "full", "v1"]);
const TAB_SNAPSHOT_SESSION_KEY = "breezy:candidates:tab:lastOk:v1";
const TAB_SNAPSHOT_SESSION_MAX_AGE_MS = 30 * 60 * 1000;

/** In-memory last ok tab snapshot (survives ok:false writes to client cache). */
let lastOkTabSnapshot: BreezyCandidatesSuccess | null = null;

function isRenderableCandidatesSnapshot(
  result: BreezyCandidatesResult,
): result is BreezyCandidatesSuccess {
  return result.ok === true && Array.isArray(result.candidates);
}

function describeCandidatesPayload(payload: BreezyCandidatesResult): Record<string, unknown> {
  return {
    ok: payload.ok,
    candidateCount: payload.ok ? payload.candidates.length : 0,
    hasCandidatesArray: payload.ok ? Array.isArray(payload.candidates) : false,
    error: payload.ok ? undefined : payload.error,
    scanMode: payload.ok ? payload.scanMode : undefined,
  };
}

function shouldCacheCandidatesPayload(
  payload: BreezyCandidatesResult,
  scan: BreezyCandidatesScanMode,
): boolean {
  if (!isRenderableCandidatesSnapshot(payload)) return false;
  if ((scan === "preview" || scan === "fast") && payload.candidates.length === 0) return false;
  return true;
}

function isUsableTabCacheHit(
  payload: BreezyCandidatesResult,
  scan: BreezyCandidatesScanMode,
): payload is BreezyCandidatesSuccess {
  if (!isRenderableCandidatesSnapshot(payload)) return false;
  if (scan === "preview" || scan === "fast") return hasPopulatedCandidatesSnapshot(payload);
  return true;
}

function readPersistedTabSnapshot(): BreezyCandidatesSuccess | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(TAB_SNAPSHOT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; snapshot?: BreezyCandidatesSuccess };
    if (!parsed.snapshot?.ok || !Array.isArray(parsed.snapshot.candidates)) return null;
    if (parsed.snapshot.candidates.length === 0) return null;
    if (
      typeof parsed.savedAt === "number" &&
      Date.now() - parsed.savedAt > TAB_SNAPSHOT_SESSION_MAX_AGE_MS
    ) {
      return null;
    }
    return parsed.snapshot;
  } catch {
    return null;
  }
}

function persistTabSnapshotToSession(snapshot: BreezyCandidatesSuccess): void {
  if (typeof window === "undefined" || snapshot.candidates.length === 0) return;
  const prior = readPersistedTabSnapshot();
  if (prior) {
    const decision = shouldAcceptCandidatesCacheWrite(snapshot, prior);
    logCandidatesCacheWriteDecision("client", TAB_SNAPSHOT_SESSION_KEY, decision);
    if (!decision.accepted) return;
  }
  try {
    sessionStorage.setItem(
      TAB_SNAPSHOT_SESSION_KEY,
      JSON.stringify({ savedAt: Date.now(), snapshot }),
    );
  } catch {
    // Quota or private mode — in-memory fallback still applies.
  }
}

function rememberTabOkSnapshot(result: BreezyCandidatesSuccess): BreezyCandidatesSuccess {
  const enriched =
    result.source === BREEZY_CANDIDATES_SOURCE.label
      ? result
      : withCandidatesSyncMeta(result, { fromCache: result.fromCache ?? false, stale: result.stale });
  if (lastOkTabSnapshot) {
    const decision = shouldAcceptCandidatesCacheWrite(enriched, lastOkTabSnapshot);
    logCandidatesCacheWriteDecision("client", "tab:lastOk", decision);
    if (!decision.accepted) return lastOkTabSnapshot;
  }
  lastOkTabSnapshot = enriched;
  if (hasPopulatedCandidatesSnapshot(enriched)) {
    persistTabSnapshotToSession(enriched);
  }
  if (enriched.hydrationJob) persistClientHydrationBackup(enriched.hydrationJob);
  return enriched;
}

function collectTabSnapshotCandidates(): BreezyCandidatesSuccess[] {
  const snapshots: BreezyCandidatesSuccess[] = [];
  for (const key of [TAB_FULL_CACHE_KEY, TAB_FAST_CACHE_KEY, TAB_PREVIEW_CACHE_KEY]) {
    const hit = getCachedAllowExpired<BreezyCandidatesResult>(key);
    if (hit?.ok && hit.candidates.length > 0) snapshots.push(hit);
  }
  if (lastOkTabSnapshot && lastOkTabSnapshot.candidates.length > 0) {
    snapshots.push(lastOkTabSnapshot);
  }
  const persisted = readPersistedTabSnapshot();
  if (persisted) snapshots.push(persisted);
  return snapshots;
}

function getRichestTabSnapshot(): BreezyCandidatesSuccess | null {
  return pickRichestCandidatesSnapshot(collectTabSnapshotCandidates());
}

function preserveRicherTabSnapshot(
  incoming: BreezyCandidatesSuccess,
  cacheKey: string,
  context?: { hydrationRoundId?: string },
): BreezyCandidatesSuccess {
  const richest = getRichestTabSnapshot();
  const baseline = pickRichestCandidatesSnapshot([richest, lastOkTabSnapshot]);
  const incumbent = baseline ?? lastOkTabSnapshot;
  if (!incumbent) return rememberTabOkSnapshot(incoming);
  const decision = shouldAcceptCandidatesCacheWrite(incoming, incumbent, context);
  logCandidatesCacheWriteDecision("client", cacheKey, decision);
  if (!decision.accepted) return incumbent;
  return rememberTabOkSnapshot(incoming);
}

export function getLastOkTabCandidatesSnapshot(): BreezyCandidatesSuccess | null {
  return lastOkTabSnapshot;
}

/** Instant tab paint from richest client cache tier (never prefer preview over hydrated fast/full). */
export function peekTabCandidatesCache(): BreezyCandidatesSuccess | null {
  const richest = getRichestTabSnapshot();
  if (richest) {
    return rememberTabOkSnapshot(richest);
  }
  return null;
}

export function toStaleTabCandidatesResult(
  snapshot: BreezyCandidatesSuccess,
  refreshError: string,
): CandidatesTabFetchResult {
  return {
    ...withCandidatesSyncMeta(snapshot, {
      fromCache: true,
      stale: true,
      refreshError,
    }),
    showingCachedSnapshot: true,
  };
}

export type CandidatesTabFetchResult = BreezyCandidatesResult & {
  clientTimedOut?: boolean;
  showingCachedSnapshot?: boolean;
};

function buildCandidatesQuery(options?: {
  force?: boolean;
  scan?: BreezyCandidatesScanMode;
  positionsOffset?: number;
  hydrationOwnerId?: string;
}): string {
  const params = new URLSearchParams();
  if (options?.scan) params.set("scan", options.scan);
  if (options?.force) params.set("force", "true");
  if (options?.positionsOffset !== undefined && options.positionsOffset > 0) {
    params.set("positions_offset", String(Math.floor(options.positionsOffset)));
  }
  if (options?.hydrationOwnerId) {
    params.set("hydration_owner", options.hydrationOwnerId);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function cacheKeyForScan(scan: BreezyCandidatesScanMode): string {
  if (scan === "full") return TAB_FULL_CACHE_KEY;
  if (scan === "fast") return TAB_FAST_CACHE_KEY;
  return TAB_PREVIEW_CACHE_KEY;
}

function timeoutForScan(scan: BreezyCandidatesScanMode): number {
  if (scan === "full") return CANDIDATES_FULL_HYDRATION_TIMEOUT_MS;
  if (scan === "fast") return CANDIDATES_FAST_CLIENT_TIMEOUT_MS;
  return CANDIDATES_PREVIEW_CLIENT_TIMEOUT_MS;
}

function ttlForScan(scan: BreezyCandidatesScanMode): number {
  if (scan === "preview") return CANDIDATES_PREVIEW_CACHE_TTL_MS;
  return LONG_CLIENT_CACHE_TTL_MS;
}

async function fetchCandidatesLiveJson(input: {
  scan: BreezyCandidatesScanMode;
  force: boolean;
  timeoutMs: number;
  url: string;
}): Promise<BreezyCandidatesResult> {
  logBreezyCandidatesOps("client", "request_start", {
    scan: input.scan,
    force: input.force,
    timeoutMs: input.timeoutMs,
    url: input.url,
    liveFetch: true,
  });
  logCandidatesClientTrace("live_fetch_start", {
    scan: input.scan,
    force: input.force,
    timeoutMs: input.timeoutMs,
    url: input.url,
    cacheHit: false,
  });

  let res: Response;
  try {
    res = await fetchWithTimeout(input.url, {
      cache: "no-store",
      timeoutMs: input.timeoutMs,
    });
  } catch (err) {
    const timedOut = isTimeoutError(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    logBreezyCandidatesOps("client", timedOut ? "timeout" : "error", {
      scan: input.scan,
      error: errorMessage,
      phase: "live_fetch_throw",
    });
    logCandidatesClientTrace("live_fetch_threw", {
      scan: input.scan,
      timeoutTriggered: timedOut,
      errorName: err instanceof Error ? err.name : typeof err,
      errorMessage,
      introducedOkFalse: "fetch_throw_outer_catch",
    });
    throw err;
  }

  const bodyText = await res.text();
  logCandidatesClientTrace("live_fetch_http", {
    scan: input.scan,
    httpStatus: res.status,
    httpOk: res.ok,
    bodyTextLength: bodyText.length,
    timeoutTriggered: false,
  });

  let parsed: BreezyCandidatesResult;
  try {
    parsed = bodyText ? (JSON.parse(bodyText) as BreezyCandidatesResult) : { ok: false, error: "Empty response body", fetchedAt: new Date().toISOString() };
    logCandidatesClientTrace("live_fetch_json_parse", {
      scan: input.scan,
      jsonParseSuccess: true,
      ...describeCandidatesPayload(parsed),
    });
  } catch (err) {
    logCandidatesClientTrace("live_fetch_json_parse", {
      scan: input.scan,
      jsonParseSuccess: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      bodyPreview: bodyText.slice(0, 200),
      introducedOkFalse: "json_parse_failure",
    });
    throw err;
  }

  if (!res.ok) {
    logCandidatesClientTrace("live_fetch_http_error", {
      scan: input.scan,
      httpStatus: res.status,
      payload: describeCandidatesPayload(parsed),
      introducedOkFalse: parsed.ok === false ? "api_json_ok_false" : "http_status_not_ok",
    });
    const apiError = parsed.ok ? `HTTP ${res.status}` : parsed.error;
    logBreezyCandidatesOps("client", isBreezyCandidatesTimeoutMessage(apiError) ? "timeout" : "error", {
      scan: input.scan,
      httpStatus: res.status,
      error: apiError,
      phase: "live_fetch_http",
    });
  } else if (parsed.ok && parsed.candidates.length > 0) {
    logBreezyCandidatesOps("client", "success", {
      scan: input.scan,
      candidateCount: parsed.candidates.length,
      httpStatus: res.status,
      phase: "live_fetch_http",
    });
  } else if (parsed.ok) {
    logBreezyCandidatesOps("client", "empty", {
      scan: input.scan,
      httpStatus: res.status,
      phase: "live_fetch_http",
    });
  }

  return parsed;
}

async function fetchCandidatesFromApi(options: {
  scan: BreezyCandidatesScanMode;
  force?: boolean;
  positionsOffset?: number;
  timeoutMs: number;
  cacheKey: string;
  label: string;
  ttlMs: number;
}): Promise<CandidatesTabFetchResult> {
  const cachedOk = getCachedAllowExpired<BreezyCandidatesResult>(options.cacheKey);
  const fallbackFromCache: BreezyCandidatesSuccess | null =
    cachedOk && isUsableTabCacheHit(cachedOk, options.scan) ? cachedOk : null;
  const fallbackFromMemory: BreezyCandidatesSuccess | null =
    !fallbackFromCache && lastOkTabSnapshot && lastOkTabSnapshot.candidates.length > 0
      ? lastOkTabSnapshot
      : null;
  const fallbackOk: BreezyCandidatesSuccess | null = fallbackFromCache ?? fallbackFromMemory;
  const fallbackSource = fallbackFromCache
    ? "client_cache"
    : fallbackFromMemory
      ? "last_ok_tab_snapshot"
      : null;

  const freshCacheHit = !options.force ? getCached<BreezyCandidatesResult>(options.cacheKey) : null;
  if (freshCacheHit) {
    logCandidatesClientTrace("fetch_path_cache_hit", {
      scan: options.scan,
      cacheKey: options.cacheKey,
      ...describeCandidatesPayload(freshCacheHit),
    });
  }

  try {
    logBreezyCandidatesOps("client", "request_start", {
      scan: options.scan,
      force: Boolean(options.force),
      cacheKey: options.cacheKey,
      hasFallback: Boolean(fallbackOk),
      fallbackSource,
    });
    logCandidatesDebug("before_client_fetch", 0, {
      scan: options.scan,
      forceRequested: Boolean(options.force),
    });

    let forceFetch = Boolean(options.force);
    if (!forceFetch && (options.scan === "preview" || options.scan === "fast")) {
      const staleHit = getCached<BreezyCandidatesResult>(options.cacheKey);
      if (staleHit?.ok && staleHit.candidates.length === 0) {
        invalidateCached(options.cacheKey);
        forceFetch = true;
        logCandidatesDebug("preview_skip_empty_client_cache", 0, { scan: options.scan });
        logCandidatesClientTrace("skip_empty_client_cache_hit", {
          scan: options.scan,
          cacheKey: options.cacheKey,
        });
      }
    }

    const requestUrl = `${BREEZY_CANDIDATES_SOURCE.apiPath}${buildCandidatesQuery({
      scan: options.scan,
      force: forceFetch,
      positionsOffset: options.positionsOffset,
      hydrationOwnerId,
    })}`;

    const parsed = await fetchCachedJson<BreezyCandidatesResult>(
      options.cacheKey,
      () =>
        fetchCandidatesLiveJson({
          scan: options.scan,
          force: forceFetch,
          timeoutMs: options.timeoutMs,
          url: requestUrl,
        }),
      {
        ttlMs: options.ttlMs,
        force: forceFetch,
        label: options.label,
        // Do not return stale ok:false payloads on timeout — outer catch uses populated fallbackOk.
        staleOnError: false,
        shouldCache: (payload) => {
          if (!shouldCacheCandidatesPayload(payload, options.scan)) return false;
          if (!payload.ok) return false;
          const prior = getCachedAllowExpired<BreezyCandidatesResult>(options.cacheKey);
          if (prior?.ok) {
            const decision = shouldAcceptCandidatesCacheWrite(payload, prior);
            logCandidatesCacheWriteDecision("client", options.cacheKey, decision);
            return decision.accepted;
          }
          return true;
        },
      },
    );

    logCandidatesClientTrace("fetch_cached_json_resolved", {
      scan: options.scan,
      forceFetch,
      cacheHit: Boolean(freshCacheHit) && !forceFetch,
      liveFetch: forceFetch || !freshCacheHit,
      ...describeCandidatesPayload(parsed),
    });

    if (isRenderableCandidatesSnapshot(parsed)) {
      logCandidatesDebug("before_client_api_response", 0, { scan: options.scan });
      const diag = parsed.previewDiagnostics;
      logCandidatesDebug("after_client_api_response", parsed.candidates.length, {
        scan: options.scan,
        forceRequested: Boolean(options.force),
        positionsScanned: parsed.positionsScanned ?? 0,
        fromCache: parsed.fromCache ?? false,
        partial: parsed.partial ?? false,
        territoryFiltered: parsed.skippedCandidatesReason?.territoryFiltered ?? 0,
        normalizedCandidateCount: parsed.candidates.length,
        rawBreezyResponseCount: diag?.rawBreezyResponseCount,
        extractedCandidatesCount: diag?.extractedCandidatesCount,
        servedFromServerCache: diag?.servedFromServerCache,
        previewPageSize: diag?.previewPageSize,
        previewMaxPages: diag?.previewMaxPages,
        jobsWithApplicantCount: diag?.jobsWithApplicantCount,
      });
      logFirstCandidateKeys(
        "after_client_api_response",
        parsed.candidates[0] as unknown as Record<string, unknown> | undefined,
      );
      logCandidatesClientTrace("fast_tier_response", {
        scan: options.scan,
        ok: true,
        candidateCount: parsed.candidates.length,
        normalizedCandidateCount: parsed.candidates.length,
        fromCache: parsed.fromCache ?? false,
        partial: parsed.partial ?? false,
      });
      if (hasPopulatedCandidatesSnapshot(parsed)) {
        const preserved = preserveRicherTabSnapshot(parsed, options.cacheKey);
        if (preserved.candidates.length > parsed.candidates.length) {
          logBreezyCandidatesOps("client", "fallback", {
            scan: options.scan,
            fallbackSource: "richest_tab_snapshot",
            candidateCount: preserved.candidates.length,
            reason: "reject_poorer_live_payload",
          });
          return toStaleTabCandidatesResult(
            preserved,
            "Sync returned fewer candidates — showing last hydrated snapshot.",
          );
        }
        logBreezyCandidatesOps("client", "success", {
          scan: options.scan,
          candidateCount: parsed.candidates.length,
          fromCache: parsed.fromCache ?? false,
          partial: parsed.partial ?? false,
        });
        if (preserved.hydrationJob) persistClientHydrationBackup(preserved.hydrationJob);
        return preserved;
      }
      if (fallbackOk && fallbackOk.candidates.length > 0) {
        logBreezyCandidatesOps("client", "fallback", {
          scan: options.scan,
          fallbackSource,
          candidateCount: fallbackOk.candidates.length,
          reason: "empty_ok_payload",
        });
        logCandidatesClientTrace("empty_ok_payload_use_fallback", {
          scan: options.scan,
          fallbackCandidateCount: fallbackOk.candidates.length,
          replacedSuccessfulApiWithFallback: true,
        });
        return toStaleTabCandidatesResult(
          fallbackOk,
          "Breezy returned no candidates for this tier; using prior snapshot.",
        );
      }
      logBreezyCandidatesOps("client", "empty", {
        scan: options.scan,
        candidateCount: 0,
      });
      logCandidatesClientTrace("empty_ok_payload_no_fallback", {
        scan: options.scan,
        introducedOkFalse: false,
        ok: true,
        candidateCount: 0,
      });
      return parsed;
    }

    logCandidatesClientTrace("non_renderable_payload", {
      scan: options.scan,
      ...describeCandidatesPayload(parsed),
      introducedOkFalse: parsed.ok === false,
      hasFallbackOk: Boolean(fallbackOk),
    });

    if (fallbackOk) {
      logBreezyCandidatesOps("client", "fallback", {
        scan: options.scan,
        fallbackSource,
        candidateCount: fallbackOk.candidates.length,
        reason: "non_renderable_payload",
        apiError: parsed.ok ? undefined : parsed.error,
      });
      logCandidatesClientTrace("failure_payload_use_fallback", {
        scan: options.scan,
        fallbackCandidateCount: fallbackOk.candidates.length,
        apiError: parsed.ok ? undefined : parsed.error,
        replacedFailedApiWithFallback: true,
      });
      return toStaleTabCandidatesResult(fallbackOk, parsed.ok ? "Invalid candidates payload" : parsed.error);
    }

    const apiError = parsed.ok ? "Invalid candidates payload" : parsed.error;
    if (isBreezyCandidatesTimeoutMessage(apiError)) {
      logBreezyCandidatesOps("client", "timeout", { scan: options.scan, error: apiError });
    } else {
      logBreezyCandidatesOps("client", "error", {
        scan: options.scan,
        error: apiError,
        introducedOkFalse: true,
      });
    }

    logCandidatesClientTrace("failure_payload_returned", {
      scan: options.scan,
      ...describeCandidatesPayload(parsed),
    });
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load Breezy candidates";
    const timedOut = isTimeoutError(err);

    logCandidatesClientTrace("fetch_outer_catch", {
      scan: options.scan,
      timeoutTriggered: timedOut,
      errorName: err instanceof Error ? err.name : typeof err,
      errorMessage: message,
      hasFallbackOk: Boolean(fallbackOk),
      introducedOkFalse: !fallbackOk,
    });

    if (fallbackOk) {
      logBreezyCandidatesOps("client", "fallback", {
        scan: options.scan,
        fallbackSource,
        candidateCount: fallbackOk.candidates.length,
        reason: timedOut ? "fetch_timeout" : "fetch_error",
        error: message,
      });
      return {
        ...toStaleTabCandidatesResult(
          fallbackOk,
          timedOut
            ? timeoutShowsCachedCandidatesMessage(options.timeoutMs, true)
            : message,
        ),
        clientTimedOut: timedOut,
      };
    }

    if (timedOut) {
      logBreezyCandidatesOps("client", "timeout", { scan: options.scan, error: message });
    } else {
      logBreezyCandidatesOps("client", "error", { scan: options.scan, error: message });
    }

    return {
      ...withCandidatesFailureMeta(
        timedOut
          ? timeoutShowsCachedCandidatesMessage(options.timeoutMs, false)
          : message,
        new Date().toISOString(),
      ),
      clientTimedOut: timedOut,
    };
  }
}

export async function fetchCandidatesForTab(options?: {
  force?: boolean;
  scan?: BreezyCandidatesScanMode;
  positionsOffset?: number;
}): Promise<CandidatesTabFetchResult> {
  const scan = options?.scan ?? "preview";
  if (!options?.force) {
    const warmKey = cacheKeyForScan(scan);
    const warmHit = getCached<BreezyCandidatesResult>(warmKey);
    const best = pickRichestCandidatesSnapshot([
      getRichestTabSnapshot(),
      warmHit?.ok ? warmHit : null,
    ]);
    if (best && isUsableTabCacheHit(best, scan)) {
      logBreezyCandidatesOps("client", "success", {
        scan,
        candidateCount: best.candidates.length,
        fromCache: true,
        phase: "warm_client_cache",
        cacheTier: best.scanMode ?? "unknown",
      });
      return rememberTabOkSnapshot(best);
    }
  }
  return fetchCandidatesFromApi({
    scan,
    force: options?.force,
    positionsOffset: options?.positionsOffset,
    timeoutMs: timeoutForScan(scan),
    cacheKey: cacheKeyForScan(scan),
    label: `candidates-tab-${scan}`,
    ttlMs: ttlForScan(scan),
  });
}

export function shouldHydrateFullCandidates(snapshot: BreezyCandidatesSuccess): boolean {
  if (snapshot.hydrationJob?.hydrationComplete) return false;
  const total = snapshot.totalPositionsAvailable ?? snapshot.hydrationJob?.totalPositionsAvailable ?? 0;
  const scanned = resolveClientHydrationResumeOffset(snapshot);
  return snapshot.hydrationComplete === false || (total > 0 && scanned < total);
}

export function shouldSkipFastTierForHydration(snapshot: BreezyCandidatesSuccess): boolean {
  return shouldSkipFastTierForActiveHydration({
    candidateCount: snapshot.candidates.length,
    hydrationJob: snapshot.hydrationJob ?? readClientHydrationBackup(),
    positionsScanned: snapshot.positionsScanned,
  });
}

export async function fetchAndMergeFullCandidates(
  base: BreezyCandidatesSuccess,
): Promise<CandidatesTabFetchResult> {
  if (fullHydrationInflight) return fullHydrationInflight;

  fullHydrationInflight = (async (): Promise<CandidatesTabFetchResult> => {
    let merged: BreezyCandidatesSuccess = base;
    for (let round = 0; round < MAX_FULL_HYDRATION_ROUNDS; round += 1) {
      if (!shouldHydrateFullCandidates(merged)) {
        return preserveRicherTabSnapshot(merged, TAB_FULL_CACHE_KEY, {
          hydrationRoundId: `full-complete-${round}`,
        });
      }
      const offset = resolveClientHydrationResumeOffset(merged);
      logCandidatesClientTrace("hydrate_full_round_start", {
        round,
        offset,
        candidateCount: merged.candidates.length,
        totalPositionsAvailable: merged.totalPositionsAvailable ?? 0,
        hydrationRoundId: merged.hydrationJob?.hydrationRoundId,
      });
      const full = await fetchCandidatesForTab({
        scan: "full",
        force: true,
        positionsOffset: offset,
      });
      if (!full.ok) return full;
      merged = preserveRicherTabSnapshot(mergeCandidatesSnapshots(merged, full), TAB_FULL_CACHE_KEY, {
        hydrationRoundId: `full-${round}`,
      });
      logCandidatesClientTrace("hydrate_full_round_complete", {
        round,
        candidateCount: merged.candidates.length,
        positionsScanned: merged.positionsScanned ?? 0,
        hydrationComplete: merged.hydrationComplete ?? false,
        hydrationPercent: merged.hydrationDiagnostics?.hydrationPercent ?? null,
      });
      if (full.clientTimedOut) break;
      if (merged.hydrationComplete || merged.hydrationJob?.hydrationComplete) break;
    }
    const finalSnapshot = preserveRicherTabSnapshot(merged, TAB_FULL_CACHE_KEY, {
      hydrationRoundId: merged.hydrationJob?.hydrationRoundId ?? "full-final",
    });
    if (finalSnapshot.ok && finalSnapshot.hydrationJob) {
      persistClientHydrationBackup(finalSnapshot.hydrationJob);
    }
    return finalSnapshot;
  })();

  try {
    return await fullHydrationInflight;
  } finally {
    fullHydrationInflight = null;
  }
}

export async function fetchAndMergeFastCandidates(
  base: BreezyCandidatesSuccess,
  options?: { force?: boolean },
): Promise<CandidatesTabFetchResult> {
  logCandidatesClientTrace("fetchAndMergeFast_start", {
    baseCandidateCount: base.candidates.length,
    baseScanMode: base.scanMode,
  });
  const fast = await fetchCandidatesForTab({ scan: "fast", force: options?.force });
  if (!fast.ok) {
    logCandidatesClientTrace("fetchAndMergeFast_failed", {
      error: fast.error,
      ok: false,
      candidateCount: 0,
    });
    return fast;
  }
  const merged = mergeCandidatesSnapshots(base, fast);
  logCandidatesClientTrace("fetchAndMergeFast_merged", {
    fastCandidateCount: fast.candidates.length,
    baseCandidateCount: base.candidates.length,
    mergedCandidateCount: merged.candidates.length,
  });
  return preserveRicherTabSnapshot(merged, TAB_FAST_CACHE_KEY);
}
