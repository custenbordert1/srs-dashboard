"use client";

import type { TerritoryOverviewCard } from "@/lib/routing-intelligence/territory-overview";
import {
  SEVERITY_BADGE_STYLES,
  SEVERITY_LABELS,
} from "@/lib/recruiting-dashboard-ux/severity-styles";

type RoutingTerritoryOverviewProps = {
  cards: TerritoryOverviewCard[];
  onSelectPack?: (routePackId: string) => void;
};

export function RoutingTerritoryOverview({ cards, onSelectPack }: RoutingTerritoryOverviewProps) {
  return (
    <section className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-500/10 to-zinc-950/50 p-4 sm:p-5">
      <header className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-300/90">
          Territory route overview
        </p>
        <h3 className="mt-1 text-base font-semibold text-zinc-50">Operational territory snapshot</h3>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => card.routePackId && onSelectPack?.(card.routePackId)}
            className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3 text-left transition hover:border-violet-500/40 hover:bg-violet-500/5"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase text-zinc-500">{card.title}</p>
              <span
                className={`rounded-full border px-1.5 py-0.5 text-[9px] uppercase ${SEVERITY_BADGE_STYLES[card.severity]}`}
              >
                {SEVERITY_LABELS[card.severity]}
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold text-zinc-100">{card.headline}</p>
            <p className="mt-1 text-xs text-zinc-400">{card.detail}</p>
          </button>
        ))}
      </div>
    </section>
  );
}
