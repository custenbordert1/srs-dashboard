type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  generatedAt: string;
};

const store = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): { hit: boolean; value: T | null; generatedAt: string | null } {
  const entry = store.get(key);
  if (!entry) return { hit: false, value: null, generatedAt: null };
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return { hit: false, value: null, generatedAt: null };
  }
  return { hit: true, value: entry.value as T, generatedAt: entry.generatedAt };
}

export function setCached<T>(key: string, value: T, ttlMs = 60_000): string {
  const generatedAt = new Date().toISOString();
  store.set(key, { value, expiresAt: Date.now() + ttlMs, generatedAt });
  return generatedAt;
}

export function clearP1866CacheForTests(): void {
  store.clear();
}

export function paginate<T>(
  items: T[],
  page = 1,
  pageSize = 50,
): { items: T[]; page: number; pageSize: number; total: number; totalPages: number } {
  const size = Math.max(1, Math.min(200, pageSize));
  const p = Math.max(1, page);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const start = (p - 1) * size;
  return {
    items: items.slice(start, start + size),
    page: p,
    pageSize: size,
    total,
    totalPages,
  };
}
