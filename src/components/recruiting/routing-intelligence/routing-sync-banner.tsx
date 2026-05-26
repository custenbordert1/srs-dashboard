"use client";

type RoutingSyncBannerProps = {
  syncing: boolean;
  stale?: boolean;
  cacheHit?: boolean;
};

export function RoutingSyncBanner({ syncing, stale, cacheHit }: RoutingSyncBannerProps) {
  if (!syncing && !stale) return null;

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-100/90">
      {syncing ? (
        <span>Syncing route intelligence… showing {cacheHit ? "cached" : "last known"} route data.</span>
      ) : (
        <span>Route intelligence may be stale — refresh when convenient.</span>
      )}
    </div>
  );
}
