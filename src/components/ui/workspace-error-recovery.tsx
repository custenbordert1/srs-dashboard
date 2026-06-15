"use client";

import { DashboardFetchAlert } from "@/components/ui/dashboard-fetch-alert";
import { UI_SURFACE } from "@/lib/ui-tokens";

type WorkspaceErrorRecoveryProps = {
  title?: string;
  error: string;
  partialDataAvailable?: boolean;
  onRetry?: () => void;
  retryLabel?: string;
};

export function WorkspaceErrorRecovery({
  title = "Something went wrong",
  error,
  partialDataAvailable = false,
  onRetry,
  retryLabel = "Retry",
}: WorkspaceErrorRecoveryProps) {
  return (
    <div className={UI_SURFACE.panel}>
      <DashboardFetchAlert
        title={title}
        message={error}
        partial={partialDataAvailable}
        onRetry={onRetry}
        retryLabel={retryLabel}
      />
      {partialDataAvailable ? (
        <p className="mt-3 text-xs text-zinc-500">
          Cached sections below may still be usable while sync recovers.
        </p>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">
          No live data is shown until the next successful sync.
        </p>
      )}
    </div>
  );
}
