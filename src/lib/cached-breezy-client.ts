import { cacheKey, fetchCachedJson, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import type { BreezyCandidatesResult, BreezyJobsResult } from "@/lib/breezy-api";
import { logDashboardFetch } from "@/lib/dashboard-fetch-log";
import {
  BREEZY_CANDIDATES_FAST_CLIENT_TIMEOUT_MS,
  BREEZY_CLIENT_REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
  isTimeoutError,
  timeoutErrorMessage,
} from "@/lib/fetch-with-timeout";

async function fetchBreezyJson<T>(
  path: string,
  label: string,
  timeoutMs = BREEZY_CLIENT_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const started = performance.now();
  logDashboardFetch("start", { route: path, label });
  try {
    const res = await fetchWithTimeout(path, {
      cache: "no-store",
      timeoutMs,
    });
    const parsed = (await res.json()) as T;
    logDashboardFetch(res.ok ? "success" : "error", {
      route: path,
      label,
      ms: Math.round(performance.now() - started),
      status: res.status,
    });
    return parsed;
  } catch (err) {
    const ms = Math.round(performance.now() - started);
    if (isTimeoutError(err)) {
      logDashboardFetch("timeout", { route: path, label, ms, error: "client timeout" });
      throw new Error(timeoutErrorMessage(label, timeoutMs));
    }
    logDashboardFetch("error", {
      route: path,
      label,
      ms,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function fetchCachedBreezyCandidates(
  force = false,
  dateRange?: { from?: string; to?: string },
): Promise<BreezyCandidatesResult> {
  const params = new URLSearchParams({ scan: "fast" });
  if (force) params.set("force", "true");
  if (dateRange?.from && dateRange?.to) {
    params.set("from", dateRange.from);
    params.set("to", dateRange.to);
  }
  const query = `?${params.toString()}`;
  return fetchCachedJson(
    cacheKey(["breezy", "candidates", "fast", dateRange?.from ?? "", dateRange?.to ?? ""]),
    async () => {
      const parsed = await fetchBreezyJson<BreezyCandidatesResult>(
        `/api/breezy/candidates${query}`,
        "Breezy candidates",
        BREEZY_CANDIDATES_FAST_CLIENT_TIMEOUT_MS,
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
