"use client";

import { useMemo, useState, type MouseEvent } from "react";
import type { RouteQueueRow } from "@/lib/routing-intelligence/route-queue";
import {
  filterRouteQueue,
  ROUTE_QUEUE_FILTER_LABELS,
  sortRouteQueue,
  type RouteQueueFilter,
  type RouteQueueSort,
} from "@/lib/routing-intelligence/recruiter-routing-filters";
import { ROUTE_RISK_STYLES } from "@/lib/routing-intelligence";
import { navigateRecruitingTab } from "@/lib/recruiting-tab-navigation";

type RoutingRouteQueueProps = {
  rows: RouteQueueRow[];
  onSelectPack?: (routePackId: string) => void;
};

export function RoutingRouteQueue({ rows, onSelectPack }: RoutingRouteQueueProps) {
  const [filter, setFilter] = useState<RouteQueueFilter>("all");
  const [sort, setSort] = useState<RouteQueueSort>("difficulty");
  const [search, setSearch] = useState("");

  const visible = useMemo(
    () => sortRouteQueue(filterRouteQueue(rows, filter, search), sort).slice(0, 24),
    [rows, filter, search, sort],
  );

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <header className="mb-3">
        <h3 className="text-base font-semibold text-zinc-50">Interactive route queue</h3>
        <p className="mt-1 text-xs text-zinc-500">Prioritized operational routes — all actions manual-only.</p>
      </header>

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter city or state…"
          className="min-w-[160px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200"
        />
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as RouteQueueFilter)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300"
        >
          {(Object.keys(ROUTE_QUEUE_FILTER_LABELS) as RouteQueueFilter[]).map((key) => (
            <option key={key} value={key}>
              {ROUTE_QUEUE_FILTER_LABELS[key]}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as RouteQueueSort)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-300"
        >
          <option value="difficulty">Sort: difficulty</option>
          <option value="stores">Sort: stores</option>
          <option value="miles">Sort: miles</option>
          <option value="tier">Sort: travel tier</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-zinc-500">No routes match this filter.</p>
      ) : (
        <ul className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {visible.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => row.routePackId && onSelectPack?.(row.routePackId)}
                className={`w-full rounded-xl border px-3 py-2.5 text-left text-xs ${ROUTE_RISK_STYLES[row.riskLevel]}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-zinc-100">
                    {row.label} · {row.city}, {row.state}
                  </p>
                  <span className="rounded-full border border-zinc-700/80 px-1.5 py-0.5 text-[9px] uppercase">
                    {row.queueType.replace(/-/g, " ")}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-zinc-400 sm:grid-cols-4">
                  <span>{row.openStoreCount} stores</span>
                  <span>{row.nearbyRepCount} reps ≤25mi</span>
                  <span>{row.estimatedMiles} mi est.</span>
                  <span>{row.travelTierLabel}</span>
                  <span>Difficulty {row.routeDifficulty}</span>
                  <span>{row.overnightRisk ? "Overnight yes" : "Overnight no"}</span>
                </div>
                <p className="mt-2 text-[10px] text-teal-300/90">{row.suggestedAction}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <WorkflowChip
                    label="Job management"
                    onClick={(event) => {
                      event.stopPropagation();
                      navigateRecruitingTab({ tab: "job-management" });
                    }}
                  />
                  <WorkflowChip
                    label="Escalations"
                    onClick={(event) => {
                      event.stopPropagation();
                      navigateRecruitingTab({ tab: "job-management", elementId: "recruiter-queue" });
                    }}
                  />
                  <WorkflowChip
                    label="Related jobs"
                    onClick={(event) => {
                      event.stopPropagation();
                      navigateRecruitingTab({ tab: "job-management" });
                    }}
                  />
                  <WorkflowChip
                    label="Ad variants"
                    onClick={(event) => {
                      event.stopPropagation();
                      navigateRecruitingTab({ tab: "job-management" });
                    }}
                  />
                  <WorkflowChip
                    label="Nearby territories"
                    onClick={(event) => {
                      event.stopPropagation();
                      navigateRecruitingTab({ tab: "mel-projects" });
                    }}
                  />
                  <WorkflowChip
                    label="Coverage"
                    onClick={(event) => {
                      event.stopPropagation();
                      navigateRecruitingTab({ tab: "automation" });
                    }}
                  />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WorkflowChip({
  label,
  onClick,
}: {
  label: string;
  onClick: (event: MouseEvent) => void;
}) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter") onClick(event as unknown as MouseEvent);
      }}
      className="rounded border border-zinc-700 px-1.5 py-0.5 text-[9px] text-zinc-400 hover:border-teal-500/40 hover:text-teal-200"
    >
      {label}
    </span>
  );
}
