import {
  cacheKey,
  fetchCachedJson,
  LONG_CLIENT_CACHE_TTL_MS,
} from "@/lib/client-api-cache";
import type { SheetDataResult } from "@/lib/google-sheet-csv";
import type { MelProjectsDataResult } from "@/lib/mel-projects-sheet";

async function fetchJson<T>(path: string, label: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const contentType = res.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error(`${label} returned HTTP ${res.status} instead of dashboard data. Refresh the page and retry.`);
  }

  const parsed = (await res.json()) as T;
  if (!res.ok) {
    throw new Error(`${label} returned HTTP ${res.status}.`);
  }

  return parsed;
}

/**
 * Archive/reference recruiting Google Sheet — not used for live job/candidate KPIs when Breezy is primary.
 * Prefer `fetchRecruitingLiveSnapshot` from `@/lib/cached-recruiting-live-client`.
 */
export async function fetchRecruitingSheetData(force = false): Promise<SheetDataResult> {
  return fetchCachedJson(
    cacheKey(["recruiting-sheet"]),
    () => fetchJson<SheetDataResult>("/api/recruiting-sheet", "Recruiting sheet"),
    { ttlMs: LONG_CLIENT_CACHE_TTL_MS, force, label: "recruiting-sheet" },
  );
}

export async function fetchMelProjectsData(force = false): Promise<MelProjectsDataResult> {
  return fetchCachedJson(
    cacheKey(["mel-projects"]),
    () => fetchJson<MelProjectsDataResult>("/api/mel-projects", "MEL projects"),
    { ttlMs: LONG_CLIENT_CACHE_TTL_MS, force, label: "mel-projects" },
  );
}
