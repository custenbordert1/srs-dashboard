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

export function KpiCards({ items }: { items: Kpi[] }) {
  return (
    <section aria-labelledby="kpi-heading" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <h2 id="kpi-heading" className="sr-only">
        Key performance indicators
      </h2>
      {items.map((kpi) => (
        <article
          key={kpi.id}
          className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5"
        >
          <p className="text-sm font-medium text-zinc-400">{kpi.label}</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
            <p className="text-3xl font-semibold tracking-tight text-zinc-50 tabular-nums sm:text-4xl">
              {kpi.value}
            </p>
            <ChangeBadge kpi={kpi} />
          </div>
          <p className="mt-2 text-xs text-zinc-500">{kpi.hint}</p>
        </article>
      ))}
    </section>
  );
}
