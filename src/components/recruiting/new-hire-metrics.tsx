import type { NewHireMetric } from "@/lib/recruiting-sample-data";

export function NewHireMetrics({ metrics }: { metrics: NewHireMetric[] }) {
  return (
    <section
      aria-labelledby="new-hires-heading"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5"
    >
      <div className="mb-4">
        <h2 id="new-hires-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
          New hire metrics
        </h2>
        <p className="text-sm text-zinc-500">Throughput and onboarding health</p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {metrics.map((m) => (
          <li
            key={m.id}
            className="rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-4 py-3 sm:px-4 sm:py-4"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {m.label}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{m.value}</p>
            <p className="mt-1 text-sm text-zinc-400">{m.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
