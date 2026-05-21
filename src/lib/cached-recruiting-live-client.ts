import { cacheKey, fetchCachedJson, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import type {
  RecruitingLiveSnapshotFailure,
  RecruitingLiveSnapshotResult,
} from "@/lib/recruiting-live-snapshot";
import {
  BREEZY_CLIENT_REQUEST_TIMEOUT_MS,
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
      try {
        const res = await fetchWithTimeout(`/api/recruiting/live-snapshot${query}`, {
          cache: "no-store",
          timeoutMs: BREEZY_CLIENT_REQUEST_TIMEOUT_MS,
        });
        return (await res.json()) as RecruitingLiveSnapshotResponse;
      } catch (err) {
        if (isTimeoutError(err)) {
          throw new Error(timeoutErrorMessage("Recruiting live snapshot", BREEZY_CLIENT_REQUEST_TIMEOUT_MS));
        }
        throw err;
      }
    },
    { ttlMs: LONG_CLIENT_CACHE_TTL_MS, force, label: "recruiting-live-snapshot" },
  );
}
