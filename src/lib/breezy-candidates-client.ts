import type { BreezyCandidatesResult, BreezyCandidatesScanMode, BreezyCandidatesSuccess } from "@/lib/breezy-api";
import {
  BREEZY_CANDIDATES_SOURCE,
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

/** Candidates tab — longer than the 10s dashboard default (server scan can take ~60–115s). */
export const CANDIDATES_BREEZY_CLIENT_TIMEOUT_MS = 60_000;
/** Full-tier hydration can exceed the fast-tier client ceiling. */
export const CANDIDATES_FULL_HYDRATION_TIMEOUT_MS = 120_000;

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

async function fetchCandidatesFromApi(options: {
  scan: BreezyCandidatesScanMode;
  force?: boolean;
  timeoutMs: number;
  cacheKey: string;
  label: string;
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
        ttlMs: LONG_CLIENT_CACHE_TTL_MS,
        force: options.force,
        label: options.label,
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
  const scan = options?.scan ?? "fast";
  const cacheKey = scan === "full" ? TAB_FULL_CACHE_KEY : TAB_FAST_CACHE_KEY;
  return fetchCandidatesFromApi({
    scan,
    force: options?.force,
    timeoutMs: scan === "full" ? CANDIDATES_FULL_HYDRATION_TIMEOUT_MS : CANDIDATES_BREEZY_CLIENT_TIMEOUT_MS,
    cacheKey,
    label: `candidates-tab-${scan}`,
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
