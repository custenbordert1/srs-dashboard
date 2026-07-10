type SectionLoadingCardProps = {
  title: string;
  badge?: string;
  rows?: number;
};

export function SectionLoadingCard({ title, badge, rows = 4 }: SectionLoadingCardProps) {
  return (
    <section
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5"
      aria-busy="true"
      aria-label={`${title} loading`}
    >
      <div className="flex items-center gap-2">
        <div className="h-7 w-48 animate-pulse rounded bg-zinc-800/80" />
        {badge ? (
          <span className="rounded-md border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-500">{badge}</span>
        ) : null}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-800/60" />
        ))}
      </div>
    </section>
  );
}
