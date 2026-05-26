"use client";

import { useMemo, useState, type MouseEvent } from "react";
import type { RouteQueueRow } from "@/lib/routing-intelligence/route-queue";
import {
  filterRouteQueue,
  ROUTE_QUEUE_FILTER_LABELS,
  ROUTE_QUEUE_SORT_LABELS,
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
          {(Object.keys(ROUTE_QUEUE_SORT_LABELS) as RouteQueueSort[]).map((key) => (
            <option key={key} value={key}>
              Sort: {ROUTE_QUEUE_SORT_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-zinc-500">No routes match this filter.</p>
      ) : (
        <div className="max-h-[560px] overflow-auto rounded-xl border border-zinc-800">
          <table className="min-w-full text-left text-[10px] text-zinc-400">
            <thead className="sticky top-0 bg-zinc-950 text-[9px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-2 py-2 font-medium">Territory</th>
                <th className="px-2 py-2 font-medium">Burden</th>
                <th className="px-2 py-2 font-medium">Overnight</th>
                <th className="px-2 py-2 font-medium">Stores</th>
                <th className="px-2 py-2 font-medium">Reps</th>
                <th className="px-2 py-2 font-medium">Pressure</th>
                <th className="px-2 py-2 font-medium">Efficiency</th>
                <th className="px-2 py-2 font-medium">Saturation</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.id}
                  className={`cursor-pointer border-t border-zinc-800/80 hover:bg-zinc-800/40 ${ROUTE_RISK_STYLES[row.riskLevel]}`}
                  onClick={() => row.routePackId && onSelectPack?.(row.routePackId)}
                >
                  <td className="px-2 py-2">
                    <p className="font-semibold text-zinc-100">
                      {row.label} · {row.city}
                    </p>
                    <p className="text-[9px] text-zinc-500">{row.queueType.replace(/-/g, " ")}</p>
                  </td>
                  <td className="px-2 py-2 tabular-nums">{row.driveBurden}</td>
                  <td className="px-2 py-2 tabular-nums">{row.overnightPercent}%</td>
                  <td className="px-2 py-2 tabular-nums">{row.openStoreCount}</td>
                  <td className="px-2 py-2 tabular-nums">{row.nearbyRepCount}</td>
                  <td className="px-2 py-2 tabular-nums">{row.staffingPressure}</td>
                  <td className="px-2 py-2 tabular-nums">{row.routeEfficiency}</td>
                  <td className="px-2 py-2 tabular-nums">{row.territorySaturation}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="space-y-2 border-t border-zinc-800 p-2">
            {visible.slice(0, 8).map((row) => (
              <li key={`actions:${row.id}`}>
                <p className="text-[10px] text-teal-300/90">{row.suggestedAction}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <WorkflowChip
                    label="Open jobs"
                    onClick={() => navigateRecruitingTab({ tab: "job-management" })}
                  />
                  <WorkflowChip
                    label="Ad variants"
                    onClick={() => navigateRecruitingTab({ tab: "job-management" })}
                  />
                  <WorkflowChip
                    label="Nearby territories"
                    onClick={() => navigateRecruitingTab({ tab: "mel-projects" })}
                  />
                  <WorkflowChip
                    label="Escalations"
                    onClick={() =>
                      navigateRecruitingTab({ tab: "job-management", elementId: "recruiter-queue" })
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
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
