import type { TerritoryHealthScore } from "@/lib/dm-dashboard";

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-300";
  if (score >= 60) return "text-teal-300";
  if (score >= 40) return "text-amber-300";
  return "text-red-300";
}

function labelBorder(label: TerritoryHealthScore["label"]): string {
  switch (label) {
    case "Healthy":
      return "border-emerald-500/35 bg-emerald-500/10";
    case "Stable":
      return "border-teal-500/35 bg-teal-500/10";
    case "At Risk":
      return "border-amber-500/35 bg-amber-500/10";
    default:
      return "border-red-500/35 bg-red-500/10";
  }
}

export function TerritoryHealthCard({ health }: { health: TerritoryHealthScore }) {
  return (
    <section
      className={`rounded-2xl border p-5 shadow-sm shadow-black/20 backdrop-blur-sm ${labelBorder(health.label)}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Territory health</p>
          <p className={`mt-2 text-5xl font-semibold tabular-nums ${scoreColor(health.score)}`}>
            {health.score}
            <span className="text-lg text-zinc-500">/100</span>
          </p>
          <p className="mt-1 text-sm font-medium text-zinc-200">{health.label}</p>
        </div>
        <ul className="grid flex-1 gap-2 sm:max-w-md">
          {health.factors.map((factor) => (
            <li key={factor.id} className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-zinc-300">{factor.label}</span>
                <span className="tabular-nums text-zinc-400">{factor.score}</span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">{factor.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
