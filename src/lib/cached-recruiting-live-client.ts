import { cacheKey, fetchCachedJson, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import type {
  RecruitingLiveSnapshotFailure,
  RecruitingLiveSnapshotResult,
} from "@/lib/recruiting-live-snapshot";
import { logDashboardFetch } from "@/lib/dashboard-fetch-log";
import {
  FETCH_T4_INTELLIGENCE_MS,
  fetchWithTimeout,
  isTimeoutError,
  timeoutErrorMessage,
} from "@/lib/fetch-with-timeout";

export type RecruitingLiveSnapshotResponse =
  | (RecruitingLiveSnapshotResult & { partial?: boolean })
  | (RecruitingLiveSnapshotFailure & { partial?: boolean });

export async function fetchRecruitingLiveSnapshot(force = false): Promise<RecruitingLiveSnapshotResponse> {
  const query = force ? "?force=true" : "";
  return fetchCachedJson(
    cacheKey(["recruiting", "live-snapshot", force ? "force" : "default"]),
    async () => {
      const route = `/api/recruiting/live-snapshot${query}`;
      const started = performance.now();
      logDashboardFetch("start", { route, label: "live-snapshot" });
      try {
        const res = await fetchWithTimeout(route, {
          cache: "no-store",
          timeoutMs: FETCH_T4_INTELLIGENCE_MS,
        });
        const parsed = (await res.json()) as RecruitingLiveSnapshotResponse;
        logDashboardFetch(parsed.ok || parsed.partial ? "success" : "error", {
          route,
          label: "live-snapshot",
          ms: Math.round(performance.now() - started),
          status: res.status,
          partial: Boolean(parsed.partial),
          error: !parsed.ok ? parsed.error : undefined,
        });
        if (parsed.partial) {
          logDashboardFetch("partial", { route, label: "live-snapshot", ms: Math.round(performance.now() - started) });
        }
        return parsed;
      } catch (err) {
        const ms = Math.round(performance.now() - started);
        if (isTimeoutError(err)) {
          logDashboardFetch("timeout", { route, label: "live-snapshot", ms });
          throw new Error(
            timeoutErrorMessage("Recruiting live snapshot", FETCH_T4_INTELLIGENCE_MS),
          );
        }
        logDashboardFetch("error", {
          route,
          label: "live-snapshot",
          ms,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    { ttlMs: LONG_CLIENT_CACHE_TTL_MS, force, label: "recruiting-live-snapshot" },
  );
}
