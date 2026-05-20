import { cacheKey, fetchCachedJson, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import type {
  RecruitingLiveSnapshotFailure,
  RecruitingLiveSnapshotResult,
} from "@/lib/recruiting-live-snapshot";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

export type RecruitingLiveSnapshotResponse =
  | (RecruitingLiveSnapshotResult & { partial?: boolean })
  | (RecruitingLiveSnapshotFailure & { partial?: boolean });

export async function fetchRecruitingLiveSnapshot(force = false): Promise<RecruitingLiveSnapshotResponse> {
  const query = force ? "?force=true" : "";
  return fetchCachedJson(
    cacheKey(["recruiting", "live-snapshot", force ? "force" : "default"]),
    async () => {
      const res = await fetchWithRetry(`/api/recruiting/live-snapshot${query}`, {
        cache: "no-store",
      });
      return (await res.json()) as RecruitingLiveSnapshotResponse;
    },
    { ttlMs: LONG_CLIENT_CACHE_TTL_MS, force, label: "recruiting-live-snapshot" },
  );
}
