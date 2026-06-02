"use client";

import {
  buildDataTrustState,
  dataTrustStatusMessage,
  dataTrustTone,
  DATA_TRUST_LABELS,
  type DataTrustInput,
  type DataTrustState,
} from "@/lib/data-trust-state";

const TONE_STYLES: Record<
  ReturnType<typeof dataTrustTone>,
  { border: string; bg: string; text: string }
> = {
  good: {
    border: "border-teal-500/35",
    bg: "bg-teal-500/10",
    text: "text-teal-200",
  },
  neutral: {
    border: "border-zinc-700/80",
    bg: "bg-zinc-900/60",
    text: "text-zinc-400",
  },
  warn: {
    border: "border-amber-500/35",
    bg: "bg-amber-500/10",
    text: "text-amber-100",
  },
  error: {
    border: "border-red-500/35",
    bg: "bg-red-500/10",
    text: "text-red-100",
  },
};

type DataTrustBadgeProps = {
  trust: DataTrustInput;
  /** Override computed state (e.g. force loading). */
  state?: DataTrustState;
  className?: string;
  showHint?: boolean;
};

export function DataTrustBadge({ trust, state, className = "", showHint = false }: DataTrustBadgeProps) {
  const resolved = state ?? buildDataTrustState(trust);
  const tone = dataTrustTone(resolved);
  const styles = TONE_STYLES[tone];
  const hint =
    showHint && resolved !== "live"
      ? dataTrustStatusMessage(resolved, {
          error: trust.error,
          timedOut: trust.timedOut,
          positionsScanned: trust.positionsScanned,
          totalPositionsAvailable: trust.totalPositionsAvailable,
        })
      : null;

  return (
    <span className={`inline-flex flex-col gap-1 ${className}`}>
      <span
        className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles.border} ${styles.bg} ${styles.text}`}
      >
        {DATA_TRUST_LABELS[resolved]}
      </span>
      {hint ? <span className="max-w-xl text-xs text-zinc-500">{hint}</span> : null}
    </span>
  );
}

type DataTrustStatusBannerProps = DataTrustBadgeProps & {
  onRetry?: () => void;
  retrying?: boolean;
};

export function DataTrustStatusBanner({
  trust,
  state,
  onRetry,
  retrying = false,
  className = "",
}: DataTrustStatusBannerProps) {
  const resolved = state ?? buildDataTrustState(trust);
  if (resolved === "live" && !trust.error && !trust.timedOut) {
    return null;
  }

  const tone = dataTrustTone(resolved);
  const styles = TONE_STYLES[tone];
  const message = dataTrustStatusMessage(resolved, {
    error: trust.error,
    timedOut: trust.timedOut,
    positionsScanned: trust.positionsScanned,
    totalPositionsAvailable: trust.totalPositionsAvailable,
  });

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${styles.border} ${styles.bg} ${styles.text} ${className}`}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <DataTrustBadge trust={trust} state={resolved} />
        </div>
        <p>{message}</p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying || trust.loading || trust.refreshing}
          className="shrink-0 rounded-lg border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          {retrying || trust.refreshing ? "Refreshing…" : "Retry"}
        </button>
      ) : null}
    </div>
  );
}
