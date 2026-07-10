import { getCachedAllowExpired, setCached } from "@/lib/client-api-cache";

export type StaleCacheEnvelope<T> = {
  data: T;
  cachedAt: string;
  lastSuccessAt: string;
};

const META_SUFFIX = ":p161-meta";

export function readStaleCache<T>(key: string): StaleCacheEnvelope<T> | null {
  const data = getCachedAllowExpired<StaleCacheEnvelope<T>>(key);
  if (!data?.data) return null;
  return data;
}

export function writeStaleCache<T>(key: string, data: T, ttlMs: number): StaleCacheEnvelope<T> {
  const now = new Date().toISOString();
  const envelope: StaleCacheEnvelope<T> = {
    data,
    cachedAt: now,
    lastSuccessAt: now,
  };
  setCached(key, envelope, ttlMs);
  setCached(`${key}${META_SUFFIX}`, { lastSuccessAt: now }, ttlMs * 2);
  return envelope;
}

export function readLastSuccessAt(key: string): string | null {
  const meta = getCachedAllowExpired<{ lastSuccessAt: string }>(`${key}${META_SUFFIX}`);
  return meta?.lastSuccessAt ?? null;
}
