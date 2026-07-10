type SectionDegradedBannerProps = {
  message: string;
  stale?: boolean;
  onRetry?: () => void;
};

export function SectionDegradedBanner({ message, stale = false, onRetry }: SectionDegradedBannerProps) {
  return (
    <div
      role="status"
      className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
    >
      {stale ? <p className="text-xs uppercase tracking-wide text-amber-200/80">Cached snapshot</p> : null}
      <p>{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-lg border border-amber-400/40 px-3 py-1 text-xs font-medium hover:bg-amber-500/20"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
