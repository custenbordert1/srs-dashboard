"use client";

import { DashboardFetchAlert } from "@/components/ui/dashboard-fetch-alert";
import { TabSkeleton } from "@/components/ui/tab-skeleton";

type DashboardSectionFallbackProps = {
  title: string;
  /** Shown while loading and before ceiling is hit. */
  loadingMessage?: string;
  isLoading?: boolean;
  loadingCeilingHit?: boolean;
  error?: string | null;
  timedOut?: boolean;
  emptyMessage?: string | null;
  isEmpty?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
  skeletonRows?: number;
  skeletonCards?: number;
  children?: React.ReactNode;
};

export function DashboardSectionFallback({
  title,
  loadingMessage = "Loading…",
  isLoading = false,
  loadingCeilingHit = false,
  error = null,
  timedOut = false,
  emptyMessage = null,
  isEmpty = false,
  onRetry,
  retrying = false,
  skeletonRows = 3,
  skeletonCards = 3,
  children,
}: DashboardSectionFallbackProps) {
  if (error && !children) {
    return (
      <section className="space-y-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">{title}</h2>
        <DashboardFetchAlert
          variant={timedOut ? "warning" : "error"}
          title={timedOut ? "Sync in progress" : "Data unavailable"}
          message={error}
          timedOut={timedOut}
          onRetry={onRetry}
          retryLabel={retrying ? "Retrying…" : "Retry"}
        />
      </section>
    );
  }

  if (isEmpty && emptyMessage && !children) {
    return (
      <section className="space-y-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">{title}</h2>
        <p className="text-sm text-zinc-500">{emptyMessage}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            {retrying ? "Refreshing…" : "Refresh"}
          </button>
        ) : null}
      </section>
    );
  }

  if (isLoading && !children) {
    return (
      <section className="space-y-3">
        {loadingCeilingHit ? (
          <DashboardFetchAlert
            variant="warning"
            title="Sync in progress"
            message={`${title} is taking longer than expected. Breezy may still be syncing in the background.`}
            timedOut
            onRetry={onRetry}
            retryLabel={retrying ? "Retrying…" : "Retry"}
          />
        ) : (
          <TabSkeleton message={loadingMessage} rows={skeletonRows} cards={skeletonCards} />
        )}
      </section>
    );
  }

  return <>{children}</>;
}
