import { cacheKey, fetchCachedJson, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import type { BreezyCandidatesResult, BreezyJobsResult } from "@/lib/breezy-api";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

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
      const res = await fetchWithRetry(`/api/breezy/candidates${query}`, { cache: "no-store" });
      const parsed = (await res.json()) as BreezyCandidatesResult;
      if (!res.ok && !parsed.ok) return parsed;
      return parsed;
    },
    { ttlMs: LONG_CLIENT_CACHE_TTL_MS, force, label: "breezy-candidates" },
  );
}

export async function fetchCachedBreezyJobs(force = false): Promise<BreezyJobsResult> {
  return fetchCachedJson(
    cacheKey(["breezy", "jobs"]),
    async () => {
      const res = await fetchWithRetry("/api/breezy/jobs", { cache: "no-store" });
      const parsed = (await res.json()) as BreezyJobsResult;
      if (!res.ok && !parsed.ok) return parsed;
      return parsed;
    },
    { ttlMs: LONG_CLIENT_CACHE_TTL_MS, force, label: "breezy-jobs" },
  );
}
