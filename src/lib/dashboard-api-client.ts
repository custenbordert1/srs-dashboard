import {
  cacheKey,
  fetchCachedJson,
  LONG_CLIENT_CACHE_TTL_MS,
} from "@/lib/client-api-cache";
import {
  DASHBOARD_REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
  HEAVY_REQUEST_TIMEOUT_MS,
  isTimeoutError,
} from "@/lib/fetch-with-timeout";
import type { SheetDataResult } from "@/lib/google-sheet-csv";
import type { MelProjectsDataResult } from "@/lib/mel-projects-sheet";

async function fetchJson<T>(
  path: string,
  label: string,
  timeoutMs = DASHBOARD_REQUEST_TIMEOUT_MS,
): Promise<T> {
  try {
    const res = await fetchWithTimeout(path, { cache: "no-store", timeoutMs });
    const contentType = res.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
      throw new Error(
        `${label} returned HTTP ${res.status} instead of dashboard data. Refresh the page and retry.`,
      );
    }

    const parsed = (await res.json()) as T & { ok?: boolean; error?: string };
    if (!res.ok) {
      const detail =
        typeof parsed === "object" && parsed && "error" in parsed && parsed.error
          ? parsed.error
          : `HTTP ${res.status}`;
      throw new Error(detail);
    }

    return parsed;
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s. Retry in a moment.`);
    }
    throw err;
  }
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
    () => fetchJson<MelProjectsDataResult>("/api/mel-projects", "MEL projects", HEAVY_REQUEST_TIMEOUT_MS),
    { ttlMs: LONG_CLIENT_CACHE_TTL_MS, force, label: "mel-projects" },
  );
}
