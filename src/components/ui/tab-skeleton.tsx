type TabSkeletonProps = {
  rows?: number;
  cards?: number;
};

export function TabSkeleton({ rows = 4, cards = 4 }: TabSkeletonProps) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading section">
      <div className="h-10 w-64 animate-pulse rounded-lg bg-zinc-800/80" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: cards }, (_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border border-zinc-800/80 bg-zinc-900/40"
          />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={`row-${i}`}
          className="h-32 animate-pulse rounded-xl border border-zinc-800/80 bg-zinc-900/40"
        />
      ))}
    </div>
  );
}
