import {
  cacheKey,
  fetchCachedJson,
  getCached,
  getCachedAllowExpired,
  LONG_CLIENT_CACHE_TTL_MS,
  setCached,
} from "@/lib/client-api-cache";
import type { AiCommandCenterSnapshot } from "@/lib/ai-recruiting-command-center";
import {
  FETCH_T4_INTELLIGENCE_MS,
  fetchWithTimeout,
  isTimeoutError,
  timeoutErrorMessage,
} from "@/lib/fetch-with-timeout";

const CACHE_KEY = cacheKey(["ai-command-center"]);
const SESSION_STORAGE_KEY = "srs:ai-command-center:snapshot";

export type AiCommandCenterFetchResult = {
  ok: boolean;
  snapshot?: AiCommandCenterSnapshot;
  error?: string;
  stale?: boolean;
  status?: number;
};

function readSessionSnapshot(): AiCommandCenterSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AiCommandCenterSnapshot;
  } catch {
    return null;
  }
}

function writeSessionSnapshot(snapshot: AiCommandCenterSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota or private mode — memory cache still applies.
  }
}

function staleFallback(error: string): AiCommandCenterFetchResult {
  const memory = getCachedAllowExpired<AiCommandCenterFetchResult>(CACHE_KEY);
  if (memory?.snapshot) {
    return {
      ok: true,
      snapshot: memory.snapshot,
      stale: true,
      error,
    };
  }
  const session = readSessionSnapshot();
  if (session) {
    return {
      ok: true,
      snapshot: session,
      stale: true,
      error,
    };
  }
  return { ok: false, error };
}

async function fetchUncached(): Promise<AiCommandCenterFetchResult> {
  try {
    const res = await fetchWithTimeout("/api/recruiting/ai-command-center", {
      cache: "no-store",
      timeoutMs: FETCH_T4_INTELLIGENCE_MS,
    });
    const parsed = (await res.json()) as AiCommandCenterFetchResult & { error?: string };

    if (!res.ok || !parsed.ok || !parsed.snapshot) {
      const detail = parsed.error ?? `HTTP ${res.status}`;
      return staleFallback(detail);
    }

    writeSessionSnapshot(parsed.snapshot);
    return { ok: true, snapshot: parsed.snapshot, status: res.status };
  } catch (err) {
    if (isTimeoutError(err)) {
      return staleFallback(timeoutErrorMessage("AI command center", FETCH_T4_INTELLIGENCE_MS));
    }
    const message = err instanceof Error ? err.message : "Unable to load AI command center.";
    return staleFallback(message);
  }
}

export async function fetchAiCommandCenterSnapshot(options?: {
  force?: boolean;
}): Promise<AiCommandCenterFetchResult> {
  if (!options?.force) {
    const fresh = getCached<AiCommandCenterFetchResult>(CACHE_KEY);
    if (fresh?.snapshot) return fresh;

    const staleMemory = getCachedAllowExpired<AiCommandCenterFetchResult>(CACHE_KEY);
    if (staleMemory?.snapshot) {
      return { ...staleMemory, stale: true };
    }

    const session = readSessionSnapshot();
    if (session) {
      return { ok: true, snapshot: session, stale: true };
    }
  }

  try {
    return await fetchCachedJson<AiCommandCenterFetchResult>(
      CACHE_KEY,
      fetchUncached,
      {
        ttlMs: LONG_CLIENT_CACHE_TTL_MS,
        force: options?.force,
        label: "ai-command-center",
        staleOnError: true,
        shouldCache: (data) => data.ok && Boolean(data.snapshot) && !data.stale,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to load AI command center.";
    return staleFallback(message);
  }
}

export function primeAiCommandCenterSnapshot(snapshot: AiCommandCenterSnapshot): void {
  const payload: AiCommandCenterFetchResult = { ok: true, snapshot };
  setCached(CACHE_KEY, payload, LONG_CLIENT_CACHE_TTL_MS);
  writeSessionSnapshot(snapshot);
}
