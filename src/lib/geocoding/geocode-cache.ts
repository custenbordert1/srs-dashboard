import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type GeocodeCacheEntry = {
  lat: number;
  lng: number;
  source: "nominatim" | "estimate";
  updatedAt: string;
};

type GeocodeCacheFile = Record<string, GeocodeCacheEntry>;

const CACHE_PATH = path.join(process.cwd(), ".data", "geocode-cache.json");

let memoryCache: GeocodeCacheFile | null = null;

function normalizeKey(parts: { city?: string; state?: string; zip?: string; address?: string }): string {
  return [parts.address, parts.city, parts.state, parts.zip]
    .map((p) => (p ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join("|");
}

export async function loadGeocodeCache(): Promise<GeocodeCacheFile> {
  if (memoryCache) return memoryCache;
  try {
    const raw = await readFile(CACHE_PATH, "utf8");
    memoryCache = JSON.parse(raw) as GeocodeCacheFile;
    return memoryCache;
  } catch {
    memoryCache = {};
    return memoryCache;
  }
}

export async function getCachedGeocode(key: string): Promise<GeocodeCacheEntry | null> {
  const cache = await loadGeocodeCache();
  return cache[key] ?? null;
}

export async function setCachedGeocode(
  key: string,
  entry: Omit<GeocodeCacheEntry, "updatedAt">,
): Promise<void> {
  const cache = await loadGeocodeCache();
  cache[key] = { ...entry, updatedAt: new Date().toISOString() };
  memoryCache = cache;
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
}

export function geocodeKey(parts: { city?: string; state?: string; zip?: string; address?: string }): string {
  return normalizeKey(parts);
}
