import type { BreezyCandidatesResult, BreezyJobsResult } from "@/lib/breezy-api";
import { peekTabCandidatesCache } from "@/lib/breezy-candidates-client";
import { withCandidatesSyncMeta } from "@/lib/breezy-candidates-sync";
import { cacheKey, getCachedAllowExpired } from "@/lib/client-api-cache";
import { fetchCachedBreezyCandidates, fetchCachedBreezyJobs } from "@/lib/cached-breezy-client";

export type CommandCenterBreezyLoad = {
  candidates: BreezyCandidatesResult;
  jobs: BreezyJobsResult;
  staleWarning: string | null;
  servingFromCache: boolean;
};

function resolveStaleCandidates(
  live: BreezyCandidatesResult,
  refreshError: string,
): BreezyCandidatesResult {
  const peek = peekTabCandidatesCache();
  if (peek) {
    return withCandidatesSyncMeta(peek, {
      fromCache: true,
      stale: true,
      refreshError,
    });
  }
  const clientCache = getCachedAllowExpired<BreezyCandidatesResult>(
    cacheKey(["breezy", "candidates", "preview", "", ""]),
  );
  if (clientCache?.ok) {
    return withCandidatesSyncMeta(clientCache, {
      fromCache: true,
      stale: true,
      refreshError,
    });
  }
  return live;
}

function resolveStaleJobs(live: BreezyJobsResult, refreshError: string): BreezyJobsResult {
  const clientCache = getCachedAllowExpired<BreezyJobsResult>(cacheKey(["breezy", "jobs"]));
  if (clientCache?.ok) {
    return clientCache;
  }
  return live;
}

/** Cache-first Breezy load for command center — never leaves executives without usable data when cache exists. */
export async function fetchCommandCenterBreezyData(force = false): Promise<CommandCenterBreezyLoad> {
  let staleWarning: string | null = null;
  let servingFromCache = false;

  const [candidatesLive, jobsLive] = await Promise.all([
    fetchCachedBreezyCandidates(force).catch((err) => {
      const message = err instanceof Error ? err.message : "Breezy candidates request failed";
      const peek = peekTabCandidatesCache();
      if (peek) {
        servingFromCache = true;
        staleWarning = message;
        return withCandidatesSyncMeta(peek, {
          fromCache: true,
          stale: true,
          refreshError: message,
        });
      }
      throw err;
    }),
    fetchCachedBreezyJobs(force).catch((err) => {
      const message = err instanceof Error ? err.message : "Breezy jobs request failed";
      const cached = getCachedAllowExpired<BreezyJobsResult>(cacheKey(["breezy", "jobs"]));
      if (cached?.ok) {
        servingFromCache = true;
        staleWarning = staleWarning ?? message;
        return cached;
      }
      throw err;
    }),
  ]);

  let candidates = candidatesLive;
  let jobs = jobsLive;

  if (!candidates.ok) {
    const refreshError = candidates.error;
    const resolved = resolveStaleCandidates(candidates, refreshError);
    if (resolved.ok) {
      candidates = resolved;
      servingFromCache = true;
      staleWarning = staleWarning ?? refreshError;
    }
  } else if ("stale" in candidates && candidates.stale) {
    servingFromCache = true;
    staleWarning = candidates.refreshError ?? staleWarning;
  }

  if (!jobs.ok) {
    const refreshError = jobs.error;
    const resolved = resolveStaleJobs(jobs, refreshError);
    if (resolved.ok) {
      jobs = resolved;
      servingFromCache = true;
      staleWarning = staleWarning ?? refreshError;
    }
  }

  return { candidates, jobs, staleWarning, servingFromCache };
}
