import type { Kpi } from "@/lib/recruiting-sample-data";

function ChangeBadge({ kpi }: { kpi: Kpi }) {
  const base =
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums";
  if (kpi.changeDirection === "flat") {
    return <span className={`${base} bg-zinc-800 text-zinc-300`}>{kpi.change}</span>;
  }
  const positive = kpi.changeDirection === "up";
  return (
    <span
      className={`${base} ${
        positive
          ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/25"
          : "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/25"
      }`}
    >
      {positive ? "↑" : "↓"} {kpi.change}
    </span>
  );
}

type KpiCardsProps = {
  items: Kpi[];
  activeCardId?: string | null;
  onCardClick?: (kpi: Kpi) => void;
  gridClassName?: string;
};

export function KpiCards({
  items,
  activeCardId = null,
  onCardClick,
  gridClassName = "grid gap-3 sm:grid-cols-2 xl:grid-cols-4",
}: KpiCardsProps) {
  return (
    <section aria-labelledby="kpi-heading" className={gridClassName}>
      <h2 id="kpi-heading" className="sr-only">
        Key performance indicators
      </h2>
      {items.map((kpi) => {
        const interactive = Boolean(onCardClick);
        const isActive = activeCardId === kpi.id;
        const className = [
          "rounded-2xl border bg-zinc-900/40 p-4 text-left shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5",
          isActive
            ? "border-teal-500/50 ring-2 ring-teal-500/25"
            : "border-zinc-800/80",
          interactive
            ? "cursor-pointer transition-colors hover:border-zinc-600 hover:bg-zinc-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40"
            : "",
        ].join(" ");

        if (!interactive) {
          return (
            <article key={kpi.id} className={className}>
              <p className="text-sm font-medium text-zinc-400">{kpi.label}</p>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
                <p className="text-3xl font-semibold tracking-tight text-zinc-50 tabular-nums sm:text-4xl">
                  {kpi.value}
                </p>
                <ChangeBadge kpi={kpi} />
              </div>
              <p className="mt-2 text-xs text-zinc-500">{kpi.hint}</p>
            </article>
          );
        }

        return (
          <button
            key={kpi.id}
            type="button"
            onClick={() => onCardClick?.(kpi)}
            aria-pressed={isActive}
            className={className}
          >
            <p className="text-sm font-medium text-zinc-400">{kpi.label}</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
              <p className="text-3xl font-semibold tracking-tight text-zinc-50 tabular-nums sm:text-4xl">
                {kpi.value}
              </p>
              <ChangeBadge kpi={kpi} />
            </div>
            <p className="mt-2 text-xs text-zinc-500">{kpi.hint}</p>
            <p className="mt-2 text-xs text-teal-400/80">Click to filter table below</p>
          </button>
        );
      })}
    </section>
  );
}
