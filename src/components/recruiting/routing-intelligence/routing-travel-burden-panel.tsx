"use client";

import type { EnrichedRoutePack } from "@/lib/routing-intelligence/types";
import { TRAVEL_TIER_LABELS } from "@/lib/routing-intelligence/travel-tier";

type RoutingTravelBurdenPanelProps = {
  packs: EnrichedRoutePack[];
  selectedPack: EnrichedRoutePack | null;
};

export function RoutingTravelBurdenPanel({ packs, selectedPack }: RoutingTravelBurdenPanelProps) {
  const focus = selectedPack ?? packs[0];
  if (!focus) return null;

  const metrics = [
    { label: "Drive burden", value: focus.burden.estimatedDriveBurden, max: 100 },
    { label: "Overnight likelihood", value: focus.burden.estimatedOvernightLikelihood, max: 100 },
    { label: "Multi-day probability", value: focus.burden.multiDayRouteProbability, max: 100 },
    { label: "Coverage saturation", value: focus.burden.coverageSaturation, max: 100 },
    { label: "Route efficiency", value: focus.burden.routeEfficiencyScore, max: 100 },
  ];

  return (
    <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 sm:p-5">
      <header className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300/90">
          Travel burden intelligence
        </p>
        <h3 className="mt-1 text-base font-semibold text-zinc-50">
          {focus.label} · {TRAVEL_TIER_LABELS[focus.travelTier]}
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          Tier 1 &lt;20mi · Tier 2 20–40 · Tier 3 40–60 · Tier 4 60+ / overnight — manual planning only.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-3">
            <p className="text-[10px] uppercase text-zinc-500">{metric.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">{metric.value}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-900">
              <div
                className="h-full rounded-full bg-amber-500/70"
                style={{ width: `${Math.min(100, (metric.value / metric.max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
