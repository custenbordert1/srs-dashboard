const store = new Map<string, { value: unknown; expiresAt: number }>();
let hits = 0;
let misses = 0;

export const SERVER_CACHE_DEFAULT_TTL_MS = 90_000;

export function getServerCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) {
    misses += 1;
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    misses += 1;
    return null;
  }
  hits += 1;
  return entry.value as T;
}

export function setServerCached<T>(key: string, value: T, ttlMs = SERVER_CACHE_DEFAULT_TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export async function withServerCache<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = getServerCached<T>(key);
  if (cached !== null) return cached;
  const value = await fn();
  setServerCached(key, value, ttlMs);
  return value;
}

export function getServerCacheMetrics(): { entries: number; hitRate: number } {
  const total = hits + misses;
  return {
    entries: store.size,
    hitRate: total > 0 ? Math.round((hits / total) * 100) : 0,
  };
}

export function invalidateServerCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
