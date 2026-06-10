"use client";

import {
  breezyAtsSyncTierLabel,
  formatBreezyAtsStatusDetails,
  formatBreezyAtsStatusHeadline,
  type BreezyAtsMetrics,
} from "@/lib/breezy-ats-metrics";

const TIER_STYLES: Record<
  BreezyAtsMetrics["syncTier"],
  { border: string; bg: string; text: string; badge: string }
> = {
  full: {
    border: "border-teal-500/30",
    bg: "bg-teal-500/10",
    text: "text-teal-100",
    badge: "bg-teal-500/20 text-teal-100",
  },
  partial: {
    border: "border-amber-500/35",
    bg: "bg-amber-500/10",
    text: "text-amber-100",
    badge: "bg-amber-500/20 text-amber-100",
  },
  cached: {
    border: "border-sky-500/30",
    bg: "bg-sky-500/10",
    text: "text-sky-100",
    badge: "bg-sky-500/20 text-sky-100",
  },
};

type BreezyAtsSyncStatusProps = {
  metrics: BreezyAtsMetrics;
  /** Show compact single-line headline only. */
  compact?: boolean;
  className?: string;
};

export function BreezyAtsSyncStatus({ metrics, compact = false, className = "" }: BreezyAtsSyncStatusProps) {
  const styles = TIER_STYLES[metrics.syncTier];
  const headline = formatBreezyAtsStatusHeadline(metrics);
  const details = formatBreezyAtsStatusDetails(metrics);

  if (compact && metrics.syncTier === "full" && metrics.ancillaryPartialErrors.length === 0) {
    return (
      <p className={`text-xs text-zinc-500 ${className}`}>
        {breezyAtsSyncTierLabel(metrics.syncTier)} · {metrics.candidatesLoaded.toLocaleString()} candidates ·
        Last sync {metrics.lastSuccessfulSyncLabel}
      </p>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div
        role={metrics.syncTier === "partial" ? "status" : undefined}
        className={`rounded-lg border px-4 py-3 ${styles.border} ${styles.bg}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles.badge}`}>
            {breezyAtsSyncTierLabel(metrics.syncTier)}
          </span>
          {metrics.scanMode ? (
            <span className="text-[10px] uppercase tracking-wide text-zinc-400">
              Scan: {metrics.scanMode}
            </span>
          ) : null}
        </div>
        <p className={`mt-2 text-sm ${styles.text}`}>{headline}</p>
        {!compact ? (
          <ul className="mt-2 space-y-0.5 text-xs text-zinc-400">
            {details.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {metrics.ancillaryPartialErrors.length > 0 ? (
        <div
          role="status"
          className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-2 text-xs text-amber-100"
        >
          <p className="font-medium">Non-ATS sections partial</p>
          <ul className="mt-1 list-inside list-disc text-amber-100/90">
            {metrics.ancillaryPartialErrors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
