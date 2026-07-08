/**
 * P161.1 — Request-facing snapshot accessor.
 *
 * Implements the non-blocking request flow:
 *
 *   Request → return cached snapshot immediately → trigger async refresh
 *           → update snapshot → next request gets fresh data
 *
 * On cold start (no cached snapshot) it returns a fast "building" placeholder in
 * <300ms and kicks off the first full refresh, so page rendering is never blocked.
 */
import {
  getCachedSnapshot,
  setCachedSnapshot,
  SNAPSHOT_FRESH_TTL_MS,
} from "@/lib/app-performance/snapshot-cache";
import {
  isRefreshing,
  triggerBackgroundRefresh,
} from "@/lib/app-performance/background-refresh";
import { buildBuildingSnapshot } from "@/lib/app-performance/snapshot-builder";
import type { ExecutiveSnapshot } from "@/lib/app-performance/snapshot-store";

export type ExecutiveSnapshotMeta = {
  origin: ExecutiveSnapshot["origin"];
  generatedAt: string;
  ageMs: number;
  ageSeconds: number;
  freshness: string;
  cached: boolean;
  stale: boolean;
  refreshing: boolean;
  fromMemory: boolean;
  buildDurationMs: number;
};

export type ServedSnapshot = {
  snapshot: ExecutiveSnapshot;
  meta: ExecutiveSnapshotMeta;
};

function toMeta(
  snapshot: ExecutiveSnapshot,
  ageMs: number,
  freshness: string,
  cached: boolean,
  fromMemory: boolean,
): ExecutiveSnapshotMeta {
  return {
    origin: snapshot.origin,
    generatedAt: snapshot.generatedAt,
    ageMs,
    ageSeconds: Math.round(ageMs / 1000),
    freshness,
    cached,
    stale: freshness === "stale" || snapshot.origin !== "full",
    refreshing: isRefreshing(),
    fromMemory,
    buildDurationMs: snapshot.buildDurationMs,
  };
}

/**
 * Returns the executive snapshot for a request without blocking on the pipeline.
 * Triggers a background refresh when the cached snapshot is aging/stale/missing.
 */
export async function serveExecutiveSnapshot(): Promise<ServedSnapshot> {
  const cached = await getCachedSnapshot();

  if (cached.snapshot && cached.freshness === "fresh" && cached.snapshot.origin === "full") {
    return {
      snapshot: cached.snapshot,
      meta: toMeta(cached.snapshot, cached.ageMs ?? 0, cached.freshness, true, cached.fromMemory),
    };
  }

  if (cached.snapshot) {
    // Serve stale/aging/building snapshot immediately; refresh in the background.
    triggerBackgroundRefresh();
    return {
      snapshot: cached.snapshot,
      meta: toMeta(cached.snapshot, cached.ageMs ?? 0, cached.freshness, true, cached.fromMemory),
    };
  }

  // Cold start: no cached snapshot. Build a fast placeholder (<300ms), cache it,
  // and kick off the first full refresh. Never block on the full pipeline.
  const placeholder = await buildBuildingSnapshot();
  await setCachedSnapshot(placeholder);
  triggerBackgroundRefresh();
  return {
    snapshot: placeholder,
    meta: toMeta(placeholder, 0, "building", false, false),
  };
}

export { SNAPSHOT_FRESH_TTL_MS };
