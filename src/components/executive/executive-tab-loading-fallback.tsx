"use client";

import { DashboardFetchAlert } from "@/components/ui/dashboard-fetch-alert";
import { TabSkeleton } from "@/components/ui/tab-skeleton";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import type { P121DegradedPanelSource } from "@/lib/p121-executive-page-loading-navigation-fix/types";

const SOURCE_LABELS: Record<P121DegradedPanelSource, string> = {
  "executive-accountability": "Executive Accountability API",
  "executive-forecasting": "Executive Forecast API",
  "pipeline-intelligence": "Pipeline Intelligence API",
  "executive-home": "Executive Home",
  "workforce-intelligence": "Workforce Intelligence API",
};

type ExecutiveApiDegradedStateProps = {
  source: P121DegradedPanelSource;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  timedOut?: boolean;
  showingCachedSnapshot?: boolean;
};

export function executivePanelSourceLabel(source: P121DegradedPanelSource): string {
  return SOURCE_LABELS[source];
}

export function ExecutiveApiDegradedState({
  source,
  message,
  onRetry,
  retrying = false,
  timedOut = false,
  showingCachedSnapshot = false,
}: ExecutiveApiDegradedStateProps) {
  const sourceLabel = SOURCE_LABELS[source];
  const title = showingCachedSnapshot
    ? "Showing cached snapshot"
    : timedOut
      ? "Sync in progress"
      : "Data temporarily unavailable";

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100 sm:p-5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/80">{sourceLabel}</p>
      <DashboardFetchAlert
        variant="warning"
        title={title}
        message={message}
        timedOut={timedOut}
        onRetry={onRetry}
        retryLabel={retrying ? "Retrying…" : "Retry"}
      />
    </section>
  );
}

export function ExecutiveTabLoadingFallback({
  source,
  message,
  onRetry,
}: {
  source: P121DegradedPanelSource;
  message: string;
  onRetry?: () => void;
}) {
  const ceilingHit = useLoadingCeiling(true, EXECUTIVE_PANEL_LOADING_CEILING_MS);

  if (ceilingHit) {
    return (
      <ExecutiveApiDegradedState
        source={source}
        message={`${SOURCE_LABELS[source]} is taking longer than expected. The tab may still be loading in the background.`}
        onRetry={onRetry ?? (() => window.location.reload())}
        timedOut
      />
    );
  }

  return <TabSkeleton message={message} cards={4} rows={4} />;
}

export function createExecutiveTabLoadingFallback(
  source: P121DegradedPanelSource,
  message: string,
) {
  return function ExecutiveLazyTabLoading() {
    return <ExecutiveTabLoadingFallback source={source} message={message} />;
  };
}
