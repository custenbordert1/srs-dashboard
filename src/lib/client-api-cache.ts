import { perfAsync } from "@/lib/perf-mark";

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export const DEFAULT_CLIENT_CACHE_TTL_MS = 90_000;
export const LONG_CLIENT_CACHE_TTL_MS = 120_000;

export function cacheKey(parts: Array<string | number | undefined | null>): string {
  return parts.filter((p) => p !== undefined && p !== null && p !== "").join(":");
}

export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached<T>(key: string, data: T, ttlMs = DEFAULT_CLIENT_CACHE_TTL_MS): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function invalidateCached(keyPrefix: string): void {
  for (const key of store.keys()) {
    if (key === keyPrefix || key.startsWith(`${keyPrefix}:`)) {
      store.delete(key);
    }
  }
  for (const key of inflight.keys()) {
    if (key === keyPrefix || key.startsWith(`${keyPrefix}:`)) {
      inflight.delete(key);
    }
  }
}

export async function fetchCachedJson<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { ttlMs?: number; force?: boolean; label?: string },
): Promise<T> {
  const ttlMs = options?.ttlMs ?? DEFAULT_CLIENT_CACHE_TTL_MS;

  if (!options?.force) {
    const hit = getCached<T>(key);
    if (hit !== null) return hit;
    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;
  } else {
    inflight.delete(key);
  }

  const run = async () => {
    try {
      const data = await perfAsync(options?.label ?? key, fetcher);
      setCached(key, data, ttlMs);
      return data;
    } finally {
      inflight.delete(key);
    }
  };

  const promise = run().catch((err) => {
    inflight.delete(key);
    throw err;
  });

  inflight.set(key, promise);
  return promise;
}
