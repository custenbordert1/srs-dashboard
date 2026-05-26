"use client";

import type { GeoVisualizationSnapshot } from "@/lib/routing-intelligence/geo-visualization";
import type { RouteCanvasCard } from "@/lib/routing-intelligence/routing-workspace";
import {
  TRAVEL_TIER_CANVAS_STYLES,
  TRAVEL_TIER_DOT_STYLES,
} from "@/lib/routing-intelligence/travel-tier";

type RoutingTerritoryRouteCanvasProps = {
  cards: RouteCanvasCard[];
  geo?: GeoVisualizationSnapshot;
  selectedPackId?: string | null;
  onSelectPack: (routePackId: string) => void;
};

export function RoutingTerritoryRouteCanvas({
  cards,
  geo,
  selectedPackId,
  onSelectPack,
}: RoutingTerritoryRouteCanvasProps) {
  const metroGroups = geo?.metroGroups ?? [];
  const groupedPackIds = new Set<string>();

  return (
    <section className="rounded-2xl border border-teal-500/25 bg-gradient-to-b from-teal-500/5 to-zinc-900/40 p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-zinc-50">Territory route canvas</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Visual route packs grouped by metro — tier colors: green · blue · amber · red.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[9px] text-zinc-400">
          <TierLegend tier={1} label="Tier 1" />
          <TierLegend tier={2} label="Tier 2" />
          <TierLegend tier={3} label="Tier 3" />
          <TierLegend tier={4} label="Tier 4" />
        </div>
      </header>

      {metroGroups.length > 0 ? (
        <div className="mb-4 space-y-3">
          {metroGroups.map((group) => {
            const groupCards = cards.filter((card) =>
              group.cities.some((city) =>
                card.cities.some((packCity) => packCity.toLowerCase() === city.toLowerCase()),
              ),
            );
            if (groupCards.length === 0) return null;
            for (const card of groupCards) groupedPackIds.add(card.routePackId);
            return (
              <div key={group.metroGroupRef}>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-teal-300/80">
                  {group.label} · connected cities
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {groupCards.map((card) => (
                    <RoutePackCanvasCard
                      key={card.routePackId}
                      card={card}
                      selected={selectedPackId === card.routePackId}
                      onSelect={() => onSelectPack(card.routePackId)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {cards.some((card) => !groupedPackIds.has(card.routePackId)) ? (
        <div>
          {metroGroups.length > 0 ? (
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Standalone route packs
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cards
              .filter((card) => !groupedPackIds.has(card.routePackId))
              .map((card) => (
                <RoutePackCanvasCard
                  key={card.routePackId}
                  card={card}
                  selected={selectedPackId === card.routePackId}
                  onSelect={() => onSelectPack(card.routePackId)}
                />
              ))}
          </div>
        </div>
      ) : metroGroups.length === 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards.map((card) => (
            <RoutePackCanvasCard
              key={card.routePackId}
              card={card}
              selected={selectedPackId === card.routePackId}
              onSelect={() => onSelectPack(card.routePackId)}
            />
          ))}
        </div>
      ) : null}

      {cards.length === 0 ? (
        <p className="text-sm text-zinc-500">No route packs to display on the canvas.</p>
      ) : null}
    </section>
  );
}

function TierLegend({ tier, label }: { tier: 1 | 2 | 3 | 4; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 px-2 py-0.5">
      <span className={`h-2 w-2 rounded-full ${TRAVEL_TIER_DOT_STYLES[tier]}`} />
      {label}
    </span>
  );
}

function RoutePackCanvasCard({
  card,
  selected,
  onSelect,
}: {
  card: RouteCanvasCard;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-xl border px-3 py-3 text-left transition ${TRAVEL_TIER_CANVAS_STYLES[card.travelTier]} ${
        selected ? "ring-2 ring-teal-400/60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-zinc-100">{card.label}</p>
        <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${TRAVEL_TIER_DOT_STYLES[card.travelTier]}`} />
      </div>
      <p className="mt-1 text-[10px] text-zinc-400">
        {card.cities.join(" · ")}, {card.state}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1 text-[9px] text-zinc-400">
        <span>{card.storeCount} stores</span>
        <span>{card.estimatedMiles} mi</span>
        <span>Score {card.routePackScore}</span>
        <span>{card.connectedCityCount} cities linked</span>
      </div>
      {card.metroGroupLabel ? (
        <p className="mt-2 text-[9px] text-teal-300/80">{card.metroGroupLabel}</p>
      ) : null}
      {card.overnightRequired ? (
        <p className="mt-1 text-[9px] font-medium text-amber-200/90">Overnight recommended</p>
      ) : null}
      <p className="mt-2 text-[9px] text-zinc-500">{card.travelTierLabel}</p>
    </button>
  );
}
