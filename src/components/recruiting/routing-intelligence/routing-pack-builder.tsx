"use client";

import { useState } from "react";
import type { EnrichedRoutePack } from "@/lib/routing-intelligence/types";
import type { JobRoutingContext } from "@/lib/routing-intelligence/types";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";
import { ROUTE_RISK_STYLES } from "@/lib/routing-intelligence";
import { TRAVEL_TIER_LABELS } from "@/lib/routing-intelligence/travel-tier";
import { navigateRecruitingTab } from "@/lib/recruiting-tab-navigation";

type RoutingPackBuilderProps = {
  packs: EnrichedRoutePack[];
  selectedPack: EnrichedRoutePack | null;
  onSelectPack: (routePackId: string) => void;
  escalations: RecruiterEscalationQueueItem[];
  jobContexts: Record<string, JobRoutingContext>;
};

export function RoutingPackBuilder({
  packs,
  selectedPack,
  onSelectPack,
  escalations,
  jobContexts,
}: RoutingPackBuilderProps) {
  const [expanded, setExpanded] = useState(true);

  if (packs.length === 0) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 text-sm text-zinc-500">
        No route packs available for this territory.
      </section>
    );
  }

  const pack = selectedPack ?? packs[0]!;
  const relatedJobs = Object.values(jobContexts).filter((ctx) =>
    pack.cities.some(
      (city) =>
        ctx.storeCluster?.city.toLowerCase() === city.toLowerCase() &&
        ctx.storeCluster?.state === pack.state,
    ),
  );
  const packEscalations = escalations.filter((row) =>
    pack.cities.some(
      (city) => city.toLowerCase() === row.city.toLowerCase() && row.state === pack.state,
    ),
  );

  return (
    <section className="rounded-2xl border border-teal-500/20 bg-teal-500/5 p-4 sm:p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-zinc-50">Route pack builder</h3>
          <p className="mt-1 text-xs text-zinc-500">Grouped metro routes — expand to review stores and staffing.</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="rounded-lg border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </header>

      <ul className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {packs.slice(0, 8).map((row) => (
          <li key={row.routePackId}>
            <button
              type="button"
              onClick={() => onSelectPack(row.routePackId)}
              className={[
                "whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px]",
                pack.routePackId === row.routePackId
                  ? "border-teal-500/50 bg-teal-500/15 text-zinc-100"
                  : "border-zinc-800 text-zinc-500 hover:border-zinc-700",
              ].join(" ")}
            >
              {row.cities.slice(0, 2).join(" + ")} · {row.storeCount}
            </button>
          </li>
        ))}
      </ul>

      <article className={`rounded-xl border p-3 ${ROUTE_RISK_STYLES[pack.staffingRisk]}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase text-zinc-500">{pack.routePackId}</p>
            <h4 className="text-sm font-semibold text-zinc-50">{pack.label}</h4>
            <p className="mt-0.5 text-xs opacity-90">{pack.groupingRecommendation}</p>
          </div>
          <span className="text-xs font-semibold tabular-nums">Score {pack.routePackScore}</span>
        </div>

        {expanded ? (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Metric label="Cities" value={pack.cities.join(" + ")} />
              <Metric label="Stores" value={String(pack.storeCount)} />
              <Metric label="Drive miles" value={String(pack.estimatedMiles)} />
              <Metric
                label="Drive time"
                value={`${Math.round(pack.estimatedDriveTimeMinutes / 60)}h ${pack.estimatedDriveTimeMinutes % 60}m`}
              />
              <Metric label="Store hours" value={`${pack.estimatedStoreHours}h`} />
              <Metric label="Suggested reps" value={String(pack.suggestedRepCount)} />
              <Metric label="Overnight" value={pack.overnightRequired ? "Required" : "No"} />
              <Metric label="Travel tier" value={TRAVEL_TIER_LABELS[pack.travelTier]} />
              <Metric label="Drive burden" value={String(pack.burden.estimatedDriveBurden)} />
              <Metric label="Efficiency" value={String(pack.burden.routeEfficiencyScore)} />
              <Metric label="Overnight %" value={`${pack.burden.estimatedOvernightLikelihood}%`} />
              <Metric label="Multi-day %" value={`${pack.burden.multiDayRouteProbability}%`} />
            </div>

            {pack.nearbyMetroSupport.length > 0 ? (
              <p className="mt-3 text-xs text-zinc-400">
                Nearby metro support: {pack.nearbyMetroSupport.join(", ")}
              </p>
            ) : null}

            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase text-zinc-500">Grouped stores</p>
              <ul className="mt-1 max-h-28 overflow-y-auto text-[11px] text-zinc-400">
                {pack.cities.map((city) => (
                  <li key={city}>
                    {city}, {pack.state} — cluster {pack.geoClusterId}
                  </li>
                ))}
              </ul>
            </div>

            {relatedJobs.length > 0 ? (
              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase text-zinc-500">Related jobs</p>
                <ul className="mt-1 text-xs text-zinc-400">
                  {relatedJobs.slice(0, 4).map((ctx) => (
                    <li key={ctx.jobId}>
                      Job {ctx.jobId} · {ctx.travelTierLabel} · burden {ctx.driveBurdenScore}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {packEscalations.length > 0 ? (
              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase text-zinc-500">Related escalations</p>
                <ul className="mt-1 text-xs text-zinc-400">
                  {packEscalations.slice(0, 4).map((row) => (
                    <li key={row.id}>
                      {row.jobTitle ?? row.city} · {row.status}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton label="Open job management" onClick={() => navigateRecruitingTab({ tab: "job-management" })} />
              <ActionButton
                label="Escalation queue"
                onClick={() => navigateRecruitingTab({ tab: "job-management" })}
              />
              <ActionButton label="Ad variants" onClick={() => navigateRecruitingTab({ tab: "job-management" })} />
              <ActionButton label="Coverage (automation)" onClick={() => navigateRecruitingTab({ tab: "automation" })} />
            </div>
          </>
        ) : null}
      </article>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-2 py-1.5">
      <p className="text-[9px] uppercase text-zinc-500">{label}</p>
      <p className="text-xs font-medium text-zinc-200">{value}</p>
    </div>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-300 hover:border-teal-500/40"
    >
      {label}
    </button>
  );
}
