import type { BreezyCandidatesResult, BreezyCandidatesSuccess } from "@/lib/breezy-api";
import {
  BREEZY_CANDIDATES_SOURCE,
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

/** Candidates tab — longer than the 10s dashboard default (server scan can take ~60–115s). */
export const CANDIDATES_BREEZY_CLIENT_TIMEOUT_MS = 60_000;

const TAB_CANDIDATES_CACHE_KEY = cacheKey(["breezy", "candidates", "tab", "v1"]);

/** In-memory last ok tab snapshot (survives ok:false writes to client cache). */
let lastOkTabSnapshot: (BreezyCandidatesSuccess & { source: string; sourcePath: string }) | null =
  null;

function isRenderableCandidatesSnapshot(
  result: BreezyCandidatesResult,
): result is BreezyCandidatesSuccess {
  return result.ok === true && Array.isArray(result.candidates);
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

export async function fetchCandidatesForTab(options?: {
  force?: boolean;
}): Promise<CandidatesTabFetchResult> {
  const cachedOk =
    getCachedAllowExpired<BreezyCandidatesResult>(TAB_CANDIDATES_CACHE_KEY);
  const fallbackOk =
    cachedOk && isRenderableCandidatesSnapshot(cachedOk)
      ? cachedOk
      : lastOkTabSnapshot;

  try {
    const query = options?.force ? "?force=true" : "";
    const parsed = await fetchCachedJson<BreezyCandidatesResult>(
      TAB_CANDIDATES_CACHE_KEY,
      async () => {
        const res = await fetchWithTimeout(`${BREEZY_CANDIDATES_SOURCE.apiPath}${query}`, {
          cache: "no-store",
          timeoutMs: CANDIDATES_BREEZY_CLIENT_TIMEOUT_MS,
        });
        return (await res.json()) as BreezyCandidatesResult;
      },
      {
        ttlMs: LONG_CLIENT_CACHE_TTL_MS,
        force: options?.force,
        label: "candidates-tab-breezy",
        staleOnError: true,
        shouldCache: (payload) => isRenderableCandidatesSnapshot(payload),
      },
    );

    if (isRenderableCandidatesSnapshot(parsed)) {
      return rememberTabOkSnapshot(parsed);
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
            ? timeoutShowsCachedCandidatesMessage(CANDIDATES_BREEZY_CLIENT_TIMEOUT_MS, true)
            : message,
        ),
        clientTimedOut: timedOut,
      };
    }

    return {
      ...withCandidatesFailureMeta(
        timedOut
          ? timeoutShowsCachedCandidatesMessage(CANDIDATES_BREEZY_CLIENT_TIMEOUT_MS, false)
          : message,
        new Date().toISOString(),
      ),
      clientTimedOut: timedOut,
    };
  }
}
