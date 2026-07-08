"use client";

import { useEffect } from "react";

/**
 * P161.1 — Client meta returned alongside executive snapshots.
 * Mirrors `ExecutiveSnapshotMeta` from the server (type-only, no runtime import).
 */
export type ExecutiveSnapshotClientMeta = {
  origin: "full" | "building" | "degraded";
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

/** Poll interval while a background refresh is producing a full snapshot. */
export const SNAPSHOT_POLL_INTERVAL_MS = 6_000;

/**
 * Re-invokes `refresh` on an interval while the served snapshot is a placeholder,
 * is refreshing in the background, or is stale — so the UI upgrades to the fresh
 * full snapshot without a manual reload. Stops once a fresh full snapshot arrives.
 */
export function useSnapshotRefreshPoll(
  meta: ExecutiveSnapshotClientMeta | null,
  refresh: () => void,
  intervalMs: number = SNAPSHOT_POLL_INTERVAL_MS,
): void {
  useEffect(() => {
    if (!meta) return;
    const needsPoll = meta.refreshing || meta.origin !== "full" || meta.stale;
    if (!needsPoll) return;
    const id = setTimeout(refresh, intervalMs);
    return () => clearTimeout(id);
  }, [meta, refresh, intervalMs]);
}
