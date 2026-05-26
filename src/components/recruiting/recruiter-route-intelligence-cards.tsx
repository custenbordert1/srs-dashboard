"use client";

import type { RoutingIntelligenceSnapshot } from "@/lib/routing-intelligence";
import { ROUTE_RISK_STYLES } from "@/lib/routing-intelligence";
import { TRAVEL_TIER_LABELS } from "@/lib/routing-intelligence/travel-tier";

type RecruiterRouteIntelligenceCardsProps = {
  routing: RoutingIntelligenceSnapshot | null | undefined;
  selectedJobId?: string;
  onSelectJob?: (jobId: string) => void;
  onSelectRoutePack?: (routePackId: string) => void;
};

type CardSection = {
  id: string;
  title: string;
  rows: RoutingIntelligenceSnapshot["routeRiskQueue"];
};

export function RecruiterRouteIntelligenceCards({
  routing,
  selectedJobId,
  onSelectJob,
  onSelectRoutePack,
}: RecruiterRouteIntelligenceCardsProps) {
  if (!routing) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 text-sm text-zinc-500">
        Route intelligence will appear when MEL store data is available for this territory.
      </section>
    );
  }

  const sections: CardSection[] = [
    { id: "route-risk", title: "Route risk queue", rows: routing.routeRiskQueue },
    { id: "uncovered", title: "Uncovered territories", rows: routing.uncoveredTerritories },
    { id: "overnight", title: "Overnight risk", rows: routing.overnightRisk },
    { id: "clusters", title: "Cluster opportunities", rows: routing.clusterOpportunities },
    { id: "packs", title: "Multi-store route packs", rows: routing.multiStoreRoutePacks },
    { id: "rep-cover", title: "Nearby active rep coverage", rows: routing.nearbyRepCoverage },
    { id: "burden", title: "High-travel burden jobs", rows: routing.highTravelBurdenJobs },
  ].filter((section) => section.rows.length > 0);

  if (sections.length === 0) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 text-sm text-zinc-500">
        No route intelligence signals for the current territory snapshot.
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-violet-500/25 bg-violet-500/5 p-4 sm:p-5">
      <header className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-300/90">
          Route intelligence
        </p>
        <h3 className="mt-1 text-base font-semibold text-zinc-50">Staffing + routing strategy</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Store clusters and route packs from imported MEL data — manual staffing decisions only.
        </p>
      </header>
      <div className="grid gap-3 lg:grid-cols-2">
        {sections.map((section) => (
          <div key={section.id} className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {section.title}
            </h4>
            <ul className="mt-2 space-y-1.5">
              {section.rows.slice(0, 4).map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (row.jobId) onSelectJob?.(row.jobId);
                      if (row.routePackId) onSelectRoutePack?.(row.routePackId);
                    }}
                    className={[
                      "w-full rounded-lg border px-2.5 py-2 text-left text-xs transition",
                      ROUTE_RISK_STYLES[row.riskLevel],
                      selectedJobId && row.jobId === selectedJobId
                        ? "ring-1 ring-teal-400/50"
                        : "hover:brightness-110",
                    ].join(" ")}
                  >
                    <p className="font-medium text-zinc-100">{row.title}</p>
                    <p className="mt-0.5 text-[10px] opacity-90">{row.subtitle}</p>
                    {row.travelTier ? (
                      <p className="mt-1 text-[10px] uppercase opacity-80">
                        {TRAVEL_TIER_LABELS[row.travelTier]}
                      </p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
