"use client";

type AutomationSyncStatusBannerProps = {
  lastSyncedAt: string | null;
  stale?: boolean;
  partialSync?: boolean;
  partialErrors?: string[];
  error?: string | null;
  timedOut?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
  showDiagnostics?: boolean;
};

function formatWhen(iso: string | null): string {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function AutomationSyncStatusBanner({
  lastSyncedAt,
  stale = false,
  partialSync = false,
  partialErrors = [],
  error = null,
  timedOut = false,
  onRetry,
  retrying = false,
  showDiagnostics = true,
}: AutomationSyncStatusBannerProps) {
  const hasSoftIssue = Boolean(stale || partialSync || partialErrors.length > 0 || error || timedOut);
  if (!hasSoftIssue && lastSyncedAt) {
    return (
      <p className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-500">
        Last successful sync: {formatWhen(lastSyncedAt)}
      </p>
    );
  }

  const variant =
    error && !lastSyncedAt ? "error" : timedOut || stale ? "warning" : partialSync ? "warning" : "info";

  const styles =
    variant === "error"
      ? "border-red-500/30 bg-red-500/10 text-red-100"
      : variant === "warning"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
        : "border-sky-500/25 bg-sky-500/10 text-sky-100";

  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {stale && lastSyncedAt ? (
            <p className="font-medium">Showing last successful sync ({formatWhen(lastSyncedAt)})</p>
          ) : null}
          {partialSync ? (
            <p className="font-medium">Partial Breezy sync — some rankings may update as ATS data loads.</p>
          ) : null}
          {error ? <p className="font-medium">{error}</p> : null}
          {timedOut && !error ? (
            <p className="font-medium">Sync is taking longer than expected — cached sections remain available.</p>
          ) : null}
          {partialErrors.length > 0 && showDiagnostics ? (
            <ul className="mt-1 list-inside list-disc text-xs opacity-90">
              {partialErrors.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {lastSyncedAt ? (
            <p className="mt-1 text-xs opacity-80">Last successful sync: {formatWhen(lastSyncedAt)}</p>
          ) : null}
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          >
            {retrying ? "Retrying…" : "Retry sync"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
