import { cacheKey, fetchCachedJson, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import type { BreezyCandidatesResult, BreezyJobsResult } from "@/lib/breezy-api";
import {
  BREEZY_CLIENT_REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
  isTimeoutError,
  timeoutErrorMessage,
} from "@/lib/fetch-with-timeout";

async function fetchBreezyJson<T>(path: string, label: string): Promise<T> {
  try {
    const res = await fetchWithTimeout(path, {
      cache: "no-store",
      timeoutMs: BREEZY_CLIENT_REQUEST_TIMEOUT_MS,
    });
    return (await res.json()) as T;
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new Error(timeoutErrorMessage(label, BREEZY_CLIENT_REQUEST_TIMEOUT_MS));
    }
    throw err;
  }
}

export async function fetchCachedBreezyCandidates(
  force = false,
  dateRange?: { from?: string; to?: string },
): Promise<BreezyCandidatesResult> {
  const query =
    dateRange?.from && dateRange?.to
      ? `?from=${encodeURIComponent(dateRange.from)}&to=${encodeURIComponent(dateRange.to)}`
      : "";
  return fetchCachedJson(
    cacheKey(["breezy", "candidates", dateRange?.from ?? "", dateRange?.to ?? ""]),
    async () => {
      const parsed = await fetchBreezyJson<BreezyCandidatesResult>(
        `/api/breezy/candidates${query}`,
        "Breezy candidates",
      );
      return parsed;
    },
    { ttlMs: LONG_CLIENT_CACHE_TTL_MS, force, label: "breezy-candidates" },
  );
}

export async function fetchCachedBreezyJobs(force = false): Promise<BreezyJobsResult> {
  return fetchCachedJson(
    cacheKey(["breezy", "jobs"]),
    async () => {
      return fetchBreezyJson<BreezyJobsResult>("/api/breezy/jobs", "Breezy jobs");
    },
    { ttlMs: LONG_CLIENT_CACHE_TTL_MS, force, label: "breezy-jobs" },
  );
}
