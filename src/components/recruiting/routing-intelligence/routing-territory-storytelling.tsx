"use client";

import type { TerritoryStoryIndicator } from "@/lib/routing-intelligence/routing-workspace";

const ACCENT_STYLES: Record<TerritoryStoryIndicator["accent"], string> = {
  rose: "border-rose-500/40 bg-rose-500/10",
  emerald: "border-emerald-500/40 bg-emerald-500/10",
  amber: "border-amber-500/40 bg-amber-500/10",
  sky: "border-sky-500/40 bg-sky-500/10",
  violet: "border-violet-500/40 bg-violet-500/10",
  teal: "border-teal-500/40 bg-teal-500/10",
};

type RoutingTerritoryStorytellingProps = {
  indicators: TerritoryStoryIndicator[];
  onSelectPack?: (routePackId: string) => void;
};

export function RoutingTerritoryStorytelling({
  indicators,
  onSelectPack,
}: RoutingTerritoryStorytellingProps) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-zinc-50">Territory storytelling</h3>
        <p className="text-[11px] text-zinc-500">Operational highlights — click to open route pack.</p>
      </header>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {indicators.map((indicator) => (
          <button
            key={indicator.id}
            type="button"
            disabled={!indicator.routePackId}
            onClick={() => indicator.routePackId && onSelectPack?.(indicator.routePackId)}
            className={`rounded-xl border px-3 py-2.5 text-left transition hover:brightness-110 disabled:cursor-default disabled:opacity-70 ${ACCENT_STYLES[indicator.accent]}`}
          >
            <p className="text-[11px] font-semibold text-zinc-100">{indicator.title}</p>
            <p className="mt-1 text-[10px] text-zinc-400">{indicator.subtitle}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
