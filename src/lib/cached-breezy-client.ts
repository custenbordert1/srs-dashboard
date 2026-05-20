import { cacheKey, fetchCachedJson, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import type { BreezyCandidatesResult, BreezyJobsResult } from "@/lib/breezy-api";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

export async function fetchCachedBreezyCandidates(force = false): Promise<BreezyCandidatesResult> {
  return fetchCachedJson(
    cacheKey(["breezy", "candidates"]),
    async () => {
      const res = await fetchWithRetry("/api/breezy/candidates", { cache: "no-store" });
      return (await res.json()) as BreezyCandidatesResult;
    },
    { ttlMs: LONG_CLIENT_CACHE_TTL_MS, force, label: "breezy-candidates" },
  );
}

export async function fetchCachedBreezyJobs(force = false): Promise<BreezyJobsResult> {
  return fetchCachedJson(
    cacheKey(["breezy", "jobs"]),
    async () => {
      const res = await fetchWithRetry("/api/breezy/jobs", { cache: "no-store" });
      return (await res.json()) as BreezyJobsResult;
    },
    { ttlMs: LONG_CLIENT_CACHE_TTL_MS, force, label: "breezy-jobs" },
  );
}
