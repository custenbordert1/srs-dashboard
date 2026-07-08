type SectionErrorCardProps = {
  title: string;
  message: string;
  onRetry?: () => void;
  badge?: string;
};

export function SectionErrorCard({ title, message, onRetry, badge }: SectionErrorCardProps) {
  return (
    <section
      role="alert"
      className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5 text-sm text-amber-100"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-amber-50">{title}</h2>
        {badge ? (
          <span className="rounded-md border border-amber-400/30 px-2 py-0.5 text-[10px]">{badge}</span>
        ) : null}
      </div>
      <p className="mt-2">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg border border-amber-400/40 px-3 py-1 text-xs font-medium hover:bg-amber-500/20"
        >
          Retry
        </button>
      ) : null}
    </section>
  );
}
