/**
 * P161.1 — Background snapshot refresh orchestrator.
 *
 * Guarantees:
 * - Only ONE full pipeline build runs at a time (concurrent triggers are deduped).
 * - Refresh runs off the request path; callers fire-and-forget and never await it.
 * - Never throws to the caller; failures are recorded and the stale snapshot is kept.
 *
 * No timers/daemons are started here — refreshes are triggered on demand by page
 * requests only, honoring the "do not start daemon" safety requirement.
 */
import { buildExecutiveSnapshot } from "@/lib/app-performance/snapshot-builder";
import { setCachedSnapshot } from "@/lib/app-performance/snapshot-cache";
import { recordBackgroundRefresh } from "@/lib/app-performance/performance-metrics";

let refreshInFlight: Promise<void> | null = null;
let lastRefreshStartedAt: number | null = null;

export function isRefreshing(): boolean {
  return refreshInFlight !== null;
}

export function lastRefreshStart(): number | null {
  return lastRefreshStartedAt;
}

/**
 * Triggers a background refresh if one is not already running.
 * Returns the in-flight promise so tests can await it; request handlers should
 * NOT await it.
 */
export function triggerBackgroundRefresh(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;

  lastRefreshStartedAt = Date.now();
  refreshInFlight = (async () => {
    try {
      const snapshot = await buildExecutiveSnapshot();
      await setCachedSnapshot(snapshot);
      recordBackgroundRefresh(true);
    } catch (error) {
      recordBackgroundRefresh(false);
      console.error("[p161.1] background snapshot refresh failed", error);
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}
