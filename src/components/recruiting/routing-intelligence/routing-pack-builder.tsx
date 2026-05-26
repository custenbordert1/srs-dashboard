"use client";

import { useState } from "react";
import type { EnrichedRoutePack } from "@/lib/routing-intelligence/types";
import type { JobRoutingContext } from "@/lib/routing-intelligence/types";
import type { VariantPerformanceRow } from "@/lib/recruiting-decision-intelligence/types";
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
  variants?: VariantPerformanceRow[];
};

export function RoutingPackBuilder({
  packs,
  selectedPack,
  onSelectPack,
  escalations,
  jobContexts,
  variants = [],
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
  const packVariants = variants.filter((row) =>
    pack.cities.some(
      (city) =>
        row.cityTarget.toLowerCase().includes(city.toLowerCase()) ||
        row.state === pack.state,
    ),
  );
  const reps = pack.nearbyReps.length > 0 ? pack.nearbyReps : relatedJobs[0]?.nearbyReps ?? [];

  return (
    <section className="rounded-2xl border border-teal-500/20 bg-teal-500/5 p-4 sm:p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-zinc-50">Route pack builder</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Grouped metro routes with stores, reps, variants, and escalations.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="rounded-lg border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400"
        >
          {expanded ? "Collapse pack" : "Expand pack"}
        </button>
      </header>

      <ul className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {packs.slice(0, 10).map((row) => (
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
              {row.cities.slice(0, 2).join(" + ")} · {row.storeCount} stores
            </button>
          </li>
        ))}
      </ul>

      <article className={`rounded-xl border p-3 ${ROUTE_RISK_STYLES[pack.staffingRisk]}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase opacity-80">{pack.routePackId}</p>
            <h4 className="text-sm font-semibold text-zinc-50">{pack.label}</h4>
            <p className="mt-0.5 text-xs opacity-90">{pack.groupingRecommendation}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold tabular-nums">Pack score {pack.routePackScore}</p>
            <p className="text-[10px] opacity-80">{TRAVEL_TIER_LABELS[pack.travelTier]}</p>
          </div>
        </div>

        {expanded ? (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Metric label="Grouped cities" value={pack.cities.join(" + ")} />
              <Metric label="Store count" value={String(pack.storeCount)} />
              <Metric label="Staffing risk" value={pack.staffingRisk.replace(/_/g, " ")} />
              <Metric label="Drive miles" value={String(pack.estimatedMiles)} />
              <Metric
                label="Drive time"
                value={`${Math.floor(pack.estimatedDriveTimeMinutes / 60)}h ${pack.estimatedDriveTimeMinutes % 60}m`}
              />
              <Metric label="Store hours" value={`${pack.estimatedStoreHours}h`} />
              <Metric label="Overnight" value={pack.overnightRequired ? "Required" : "No"} />
              <Metric label="Suggested reps" value={String(pack.suggestedRepCount)} />
              {pack.nearbyMetroSupport.length > 0 ? (
                <Metric label="Metro support" value={pack.nearbyMetroSupport.join(", ")} />
              ) : null}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-2.5">
                <p className="text-[10px] font-semibold uppercase text-zinc-500">Grouped stores</p>
                <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-[11px] text-zinc-400">
                  {(pack.groupedStores.length > 0 ? pack.groupedStores : []).map((store) => (
                    <li key={store.opportunityId}>
                      {store.storeName} · {store.city}, {store.state}
                    </li>
                  ))}
                  {pack.groupedStores.length === 0 ? (
                    <li>No store rows — check MEL sync for this metro.</li>
                  ) : null}
                </ul>
              </div>
              <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-2.5">
                <p className="text-[10px] font-semibold uppercase text-zinc-500">Nearby reps</p>
                {reps.length === 0 ? (
                  <p className="mt-1 text-[11px] text-zinc-500">No reps within range.</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-[11px] text-zinc-400">
                    {reps.map((rep) => (
                      <li key={rep.repId}>
                        {rep.repName} ·{" "}
                        {rep.distanceMiles != null ? `${Math.round(rep.distanceMiles)} mi` : "—"} ·{" "}
                        {rep.active ? "active" : "inactive"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {relatedJobs.length > 0 ? (
              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase text-zinc-500">Related jobs</p>
                <ul className="mt-1 space-y-1 text-xs text-zinc-400">
                  {relatedJobs.slice(0, 5).map((ctx) => (
                    <li key={ctx.jobId}>
                      {ctx.jobId} · {ctx.travelTierLabel} · difficulty {ctx.estimatedRouteDifficulty}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {packVariants.length > 0 ? (
              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase text-zinc-500">Job ad variants</p>
                <ul className="mt-1 space-y-1 text-xs text-zinc-400">
                  {packVariants.slice(0, 5).map((row) => (
                    <li key={row.draftId}>
                      #{row.variantIndex + 1} {row.title} · {row.queueStatus} · {row.applicants} appl
                      {row.marker ? ` · ${row.marker}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {packEscalations.length > 0 ? (
              <div className="mt-3">
                <p className="text-[10px] font-semibold uppercase text-zinc-500">Related escalations</p>
                <ul className="mt-1 space-y-1 text-xs text-zinc-400">
                  {packEscalations.slice(0, 5).map((row) => (
                    <li key={row.id}>
                      {row.escalationType.replace(/-/g, " ")} · {row.status} · {row.dmName}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton
                label="Related jobs"
                onClick={() => navigateRecruitingTab({ tab: "job-management" })}
              />
              <ActionButton
                label="Escalation queue"
                onClick={() => navigateRecruitingTab({ tab: "job-management" })}
              />
              <ActionButton
                label="Ad variants"
                onClick={() => navigateRecruitingTab({ tab: "job-management" })}
              />
              <ActionButton
                label="Nearby territories"
                onClick={() => navigateRecruitingTab({ tab: "mel-projects" })}
              />
              <ActionButton
                label="Coverage recommendations"
                onClick={() => navigateRecruitingTab({ tab: "automation" })}
              />
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
      className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:border-teal-500/40 hover:bg-teal-500/10"
    >
      {label}
    </button>
  );
}
