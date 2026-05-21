"use client";

type DashboardFetchAlertProps = {
  title: string;
  message: string;
  variant?: "error" | "warning" | "info";
  timedOut?: boolean;
  partial?: boolean;
  onRetry?: () => void;
  retryLabel?: string;
};

const VARIANT_STYLES = {
  error: "border-red-500/30 bg-red-500/10 text-red-100",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-100",
} as const;

export function DashboardFetchAlert({
  title,
  message,
  variant = "error",
  timedOut,
  partial,
  onRetry,
  retryLabel = "Retry",
}: DashboardFetchAlertProps) {
  return (
    <div
      role="alert"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${VARIANT_STYLES[variant]}`}
    >
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 opacity-90">{message}</p>
        {timedOut ? (
          <p className="mt-1 text-xs opacity-75">The request timed out. Cached data may still appear below.</p>
        ) : null}
        {partial ? (
          <p className="mt-1 text-xs opacity-75">Showing partial data from the last successful sync.</p>
        ) : null}
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-lg border border-current/30 px-3 py-1 text-xs font-medium hover:bg-white/5"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function DashboardEmptyState({ message }: { message: string }) {
  return <p className="px-4 py-8 text-sm text-zinc-500 sm:px-5">{message}</p>;
}
