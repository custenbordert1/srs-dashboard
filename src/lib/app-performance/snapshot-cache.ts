/**
 * P161.1 — Executive snapshot cache (in-memory, disk-backed).
 *
 * Layered read: in-memory (fastest) → disk (survives cold start) → miss.
 * Tracks freshness so the route layer can decide whether to trigger a
 * background refresh, without ever blocking the request.
 */
import {
  readSnapshotFromDisk,
  writeSnapshotToDisk,
  type ExecutiveSnapshot,
} from "@/lib/app-performance/snapshot-store";
import {
  recordCacheHit,
  recordCacheMiss,
} from "@/lib/app-performance/performance-metrics";

/** A snapshot is "fresh" for this long; older snapshots trigger a background refresh. */
export const SNAPSHOT_FRESH_TTL_MS = 60_000;

/** Beyond this age the snapshot is flagged stale to the UI (yellow banner). */
export const SNAPSHOT_STALE_TTL_MS = 5 * 60_000;

export type SnapshotFreshness = "fresh" | "aging" | "stale" | "missing";

export type CachedSnapshotResult = {
  snapshot: ExecutiveSnapshot | null;
  ageMs: number | null;
  freshness: SnapshotFreshness;
  fromMemory: boolean;
};

let memorySnapshot: ExecutiveSnapshot | null = null;

function classify(snapshot: ExecutiveSnapshot | null): CachedSnapshotResult {
  if (!snapshot) {
    return { snapshot: null, ageMs: null, freshness: "missing", fromMemory: false };
  }
  const ageMs = Date.now() - new Date(snapshot.generatedAt).getTime();
  let freshness: SnapshotFreshness;
  if (ageMs <= SNAPSHOT_FRESH_TTL_MS) freshness = "fresh";
  else if (ageMs <= SNAPSHOT_STALE_TTL_MS) freshness = "aging";
  else freshness = "stale";
  return { snapshot, ageMs, freshness, fromMemory: snapshot === memorySnapshot };
}

/**
 * Reads the cached snapshot (memory first, then disk). Records a cache hit/miss.
 * Never rebuilds — callers trigger background refresh separately.
 */
export async function getCachedSnapshot(): Promise<CachedSnapshotResult> {
  if (memorySnapshot) {
    recordCacheHit();
    return classify(memorySnapshot);
  }

  const fromDisk = await readSnapshotFromDisk();
  if (fromDisk) {
    memorySnapshot = fromDisk;
    recordCacheHit();
    return classify(fromDisk);
  }

  recordCacheMiss();
  return classify(null);
}

/** Reads memory-only without recording metrics (used by background refresh dedupe). */
export function peekMemorySnapshot(): ExecutiveSnapshot | null {
  return memorySnapshot;
}

/** Stores a freshly built snapshot in memory + disk. */
export async function setCachedSnapshot(snapshot: ExecutiveSnapshot): Promise<void> {
  memorySnapshot = snapshot;
  await writeSnapshotToDisk(snapshot);
}

/** Test-only reset. */
export function resetSnapshotCache(): void {
  memorySnapshot = null;
}
