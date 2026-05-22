import type { BreezyCandidatesResult, BreezyCandidatesScanMode, BreezyCandidatesSuccess } from "@/lib/breezy-api";
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
  cacheKey,
  fetchCachedJson,
  getCachedAllowExpired,
  LONG_CLIENT_CACHE_TTL_MS,
} from "@/lib/client-api-cache";
import { fetchWithTimeout, isTimeoutError } from "@/lib/fetch-with-timeout";

/** Preview tier — allow server aggregation to finish before client abort. */
export const CANDIDATES_PREVIEW_CLIENT_TIMEOUT_MS = 30_000;
/** Fast-tier background hydration. */
export const CANDIDATES_BREEZY_CLIENT_TIMEOUT_MS = 45_000;
/** Full-tier hydration can exceed the fast-tier client ceiling. */
export const CANDIDATES_FULL_HYDRATION_TIMEOUT_MS = 120_000;
/** Client cache TTL for preview responses. */
export const CANDIDATES_PREVIEW_CACHE_TTL_MS = 45_000;

const TAB_PREVIEW_CACHE_KEY = cacheKey(["breezy", "candidates", "tab", "preview", "v1"]);
const TAB_FAST_CACHE_KEY = cacheKey(["breezy", "candidates", "tab", "fast", "v1"]);
const TAB_FULL_CACHE_KEY = cacheKey(["breezy", "candidates", "tab", "full", "v1"]);

/** In-memory last ok tab snapshot (survives ok:false writes to client cache). */
let lastOkTabSnapshot: (BreezyCandidatesSuccess & { source: string; sourcePath: string }) | null =
  null;

function isRenderableCandidatesSnapshot(
  result: BreezyCandidatesResult,
): result is BreezyCandidatesSuccess {
  return result.ok === true && Array.isArray(result.candidates);
}

function shouldCacheCandidatesPayload(
  payload: BreezyCandidatesResult,
  scan: BreezyCandidatesScanMode,
): boolean {
  if (!isRenderableCandidatesSnapshot(payload)) return false;
  if (scan === "preview" && payload.candidates.length === 0) return false;
  return true;
}

function rememberTabOkSnapshot(result: BreezyCandidatesSuccess): BreezyCandidatesSuccess {
  const enriched =
    result.source === BREEZY_CANDIDATES_SOURCE.label
      ? result
      : withCandidatesSyncMeta(result, { fromCache: result.fromCache ?? false, stale: result.stale });
  lastOkTabSnapshot = enriched;
  return enriched;
}

export function getLastOkTabCandidatesSnapshot(): BreezyCandidatesSuccess | null {
  return lastOkTabSnapshot;
}

/** Instant tab paint from client cache or last in-memory ok snapshot. */
export function peekTabCandidatesCache(): BreezyCandidatesSuccess | null {
  const preview = getCachedAllowExpired<BreezyCandidatesResult>(TAB_PREVIEW_CACHE_KEY);
  if (preview && hasPopulatedCandidatesSnapshot(preview)) {
    return rememberTabOkSnapshot(preview);
  }
  const fast = getCachedAllowExpired<BreezyCandidatesResult>(TAB_FAST_CACHE_KEY);
  if (fast && hasPopulatedCandidatesSnapshot(fast)) {
    return rememberTabOkSnapshot(fast);
  }
  const last = getLastOkTabCandidatesSnapshot();
  return last && last.candidates.length > 0 ? last : null;
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
}): string {
  const params = new URLSearchParams();
  if (options?.scan) params.set("scan", options.scan);
  if (options?.force) params.set("force", "true");
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
  if (scan === "fast") return CANDIDATES_BREEZY_CLIENT_TIMEOUT_MS;
  return CANDIDATES_PREVIEW_CLIENT_TIMEOUT_MS;
}

function ttlForScan(scan: BreezyCandidatesScanMode): number {
  if (scan === "preview") return CANDIDATES_PREVIEW_CACHE_TTL_MS;
  return LONG_CLIENT_CACHE_TTL_MS;
}

async function fetchCandidatesFromApi(options: {
  scan: BreezyCandidatesScanMode;
  force?: boolean;
  timeoutMs: number;
  cacheKey: string;
  label: string;
  ttlMs: number;
}): Promise<CandidatesTabFetchResult> {
  const cachedOk = getCachedAllowExpired<BreezyCandidatesResult>(options.cacheKey);
  const fallbackOk =
    cachedOk && isRenderableCandidatesSnapshot(cachedOk)
      ? cachedOk
      : lastOkTabSnapshot;

  try {
    const parsed = await fetchCachedJson<BreezyCandidatesResult>(
      options.cacheKey,
      async () => {
        const res = await fetchWithTimeout(
          `${BREEZY_CANDIDATES_SOURCE.apiPath}${buildCandidatesQuery({
            scan: options.scan,
            force: options.force,
          })}`,
          {
            cache: "no-store",
            timeoutMs: options.timeoutMs,
          },
        );
        return (await res.json()) as BreezyCandidatesResult;
      },
      {
        ttlMs: options.ttlMs,
        force: options.force,
        label: options.label,
        staleOnError: true,
        shouldCache: (payload) => shouldCacheCandidatesPayload(payload, options.scan),
      },
    );

    if (isRenderableCandidatesSnapshot(parsed)) {
      logCandidatesDebug("before_client_api_response", 0, { scan: options.scan });
      logCandidatesDebug("after_client_api_response", parsed.candidates.length, {
        scan: options.scan,
        positionsScanned: parsed.positionsScanned ?? 0,
        fromCache: parsed.fromCache ?? false,
        partial: parsed.partial ?? false,
        territoryFiltered: parsed.skippedCandidatesReason?.territoryFiltered ?? 0,
      });
      logFirstCandidateKeys(
        "after_client_api_response",
        parsed.candidates[0] as unknown as Record<string, unknown> | undefined,
      );
      if (hasPopulatedCandidatesSnapshot(parsed)) {
        return rememberTabOkSnapshot(parsed);
      }
      if (fallbackOk && fallbackOk.candidates.length > 0) {
        return toStaleTabCandidatesResult(fallbackOk, "Preview returned no candidates; using prior snapshot.");
      }
      return parsed;
    }
    if (fallbackOk) {
      return toStaleTabCandidatesResult(fallbackOk, parsed.error);
    }
    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load Breezy candidates";
    const timedOut = isTimeoutError(err);

    if (fallbackOk) {
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
}): Promise<CandidatesTabFetchResult> {
  const scan = options?.scan ?? "preview";
  return fetchCandidatesFromApi({
    scan,
    force: options?.force,
    timeoutMs: timeoutForScan(scan),
    cacheKey: cacheKeyForScan(scan),
    label: `candidates-tab-${scan}`,
    ttlMs: ttlForScan(scan),
  });
}

export function shouldHydrateFullCandidates(snapshot: BreezyCandidatesSuccess): boolean {
  const total = snapshot.totalPositionsAvailable ?? 0;
  const scanned = snapshot.positionsScanned ?? 0;
  return snapshot.hydrationComplete === false || (total > 0 && scanned < total);
}

export async function fetchAndMergeFullCandidates(
  base: BreezyCandidatesSuccess,
): Promise<CandidatesTabFetchResult> {
  const full = await fetchCandidatesForTab({ scan: "full", force: true });
  if (!full.ok) return full;
  return rememberTabOkSnapshot(mergeCandidatesSnapshots(base, full));
}

export async function fetchAndMergeFastCandidates(
  base: BreezyCandidatesSuccess,
  options?: { force?: boolean },
): Promise<CandidatesTabFetchResult> {
  const fast = await fetchCandidatesForTab({ scan: "fast", force: options?.force });
  if (!fast.ok) return fast;
  return rememberTabOkSnapshot(mergeCandidatesSnapshots(base, fast));
}
