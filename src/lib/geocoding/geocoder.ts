import { estimateGeoPoint } from "@/lib/mel-matching/distance-utils";
import { geocodeKey, getCachedGeocode, setCachedGeocode } from "@/lib/geocoding/geocode-cache";

export type GeoCoordinate = { lat: number; lng: number; source: "nominatim" | "estimate" };

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "SRS-Recruiting-Dashboard/1.0";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchNominatim(query: string): Promise<GeoCoordinate | null> {
  const url = new URL(NOMINATIM_BASE);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "us");

  try {
    const response = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    const hit = body[0];
    if (!hit?.lat || !hit.lon) return null;
    const lat = Number.parseFloat(hit.lat);
    const lng = Number.parseFloat(hit.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng, source: "nominatim" };
  } catch {
    return null;
  }
}

function buildQuery(parts: { city?: string; state?: string; zip?: string; address?: string }): string {
  const segments = [parts.address, parts.city, parts.state, parts.zip, "USA"].filter(Boolean);
  return segments.join(", ");
}

export async function resolveCoordinates(
  parts: { city?: string; state?: string; zip?: string; address?: string },
  options?: { allowNetwork?: boolean },
): Promise<GeoCoordinate | null> {
  const key = geocodeKey(parts);
  const cached = await getCachedGeocode(key);
  if (cached) return { lat: cached.lat, lng: cached.lng, source: cached.source };

  const allowNetwork = options?.allowNetwork ?? process.env.GEOCODING_ENABLED !== "false";
  let resolved: GeoCoordinate | null = null;

  if (allowNetwork && (parts.city || parts.zip || parts.address)) {
    resolved = await fetchNominatim(buildQuery(parts));
    await sleep(1100);
  }

  if (!resolved) {
    const estimated = estimateGeoPoint(parts.city ?? "", parts.state ?? "");
    if (!estimated) return null;
    resolved = { ...estimated, source: "estimate" };
  }

  await setCachedGeocode(key, resolved);
  return resolved;
}

export async function batchResolveCoordinates(
  items: Array<{ id: string; city?: string; state?: string; zip?: string; address?: string }>,
  options?: { maxNetwork?: number },
): Promise<Map<string, GeoCoordinate>> {
  const results = new Map<string, GeoCoordinate>();
  const maxNetwork = options?.maxNetwork ?? 12;
  let networkCount = 0;

  for (const item of items) {
    const allowNetwork = networkCount < maxNetwork;
    const coord = await resolveCoordinates(item, { allowNetwork });
    if (coord) {
      results.set(item.id, coord);
      if (coord.source === "nominatim") networkCount += 1;
    }
  }

  return results;
}
