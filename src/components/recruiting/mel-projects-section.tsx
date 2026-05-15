"use client";

import type { MelProjectsDataResult } from "@/lib/mel-projects-sheet";
import {
  buildMelProjectsViewModel,
  formatCompletionDisplay,
  melProjectsSnapshotToKpis,
  type MelProjectTableRow,
} from "@/lib/mel-projects-metrics";
import type { Kpi } from "@/lib/recruiting-sample-data";
import { useEffect, useMemo, useState } from "react";
import { KpiCards } from "./kpi-cards";

const selectClass =
  "w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50";

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-colors focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20";

function formatFetchedAt(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

function rowMatchesSearch(row: MelProjectTableRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    row.projectName,
    row.dm,
    row.status,
    row.state,
    String(row.repCount),
    formatCompletionDisplay(row.completionPercent),
    String(row.openCalls),
  ].some((v) => v.toLowerCase().includes(q));
}

function MelProjectsSkeleton() {
  return (
    <section
      aria-labelledby="mel-projects-heading"
      aria-busy="true"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
    >
      <div className="border-b border-zinc-800/80 px-4 py-4 sm:px-5 sm:py-5">
        <div className="h-6 w-48 animate-pulse rounded bg-zinc-800/80" />
      </div>
      <div className="space-y-3 px-4 py-6 sm:px-5">
        <div className="h-10 w-full animate-pulse rounded-lg bg-zinc-800/50" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-zinc-800/40" />
        <div className="h-48 w-full animate-pulse rounded-lg bg-zinc-800/30" />
      </div>
    </section>
  );
}

function KpiSkeletonGrid() {
  return (
    <section
      aria-labelledby="mel-kpi-heading"
      aria-busy="true"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <h2 id="mel-kpi-heading" className="sr-only">
        MEL project key performance indicators
      </h2>
      {["a", "b", "c", "d"].map((k) => (
        <div
          key={k}
          className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5"
        >
          <div className="h-4 w-28 animate-pulse rounded bg-zinc-800/80" />
          <div className="mt-4 h-9 w-20 animate-pulse rounded bg-zinc-800/60" />
          <div className="mt-3 h-3 w-full max-w-[10rem] animate-pulse rounded bg-zinc-800/50" />
        </div>
      ))}
    </section>
  );
}

export function MelProjectsSection() {
  const [data, setData] = useState<MelProjectsDataResult | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [dmFilter, setDmFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/mel-projects", { cache: "no-store" });
        const parsed = (await res.json()) as MelProjectsDataResult;
        if (!cancelled) setData(parsed);
      } catch (e) {
        if (!cancelled) {
          setData({
            ok: false,
            error: e instanceof Error ? e.message : "Network error while loading MEL projects.",
            fetchedAt: new Date().toISOString(),
            csvUrl: "",
          });
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const viewModel = useMemo(() => {
    if (!data?.ok || data.headers.length === 0) return null;
    return buildMelProjectsViewModel(data);
  }, [data]);

  const kpiItems: Kpi[] = useMemo(() => {
    if (data === undefined) return [];
    if (!data.ok) {
      return melProjectsSnapshotToKpis(
        {
          activeProjects: 0,
          activeReps: 0,
          completedPercent: null,
          openStoreCalls: 0,
          columnHint: "",
        },
        data.error,
      );
    }
    if (!viewModel) {
      return melProjectsSnapshotToKpis({
        activeProjects: 0,
        activeReps: 0,
        completedPercent: null,
        openStoreCalls: 0,
        columnHint: "Sheet has no header row",
      });
    }
    return melProjectsSnapshotToKpis(viewModel.snapshot);
  }, [data, viewModel]);

  const dmOptions = useMemo(
    () => uniqueSorted(viewModel?.tableRows.map((r) => r.dm).filter((d) => d !== "—") ?? []),
    [viewModel],
  );
  const statusOptions = useMemo(
    () => uniqueSorted(viewModel?.tableRows.map((r) => r.status) ?? []),
    [viewModel],
  );
  const stateOptions = useMemo(
    () => uniqueSorted(viewModel?.tableRows.map((r) => r.state).filter((s) => s !== "—") ?? []),
    [viewModel],
  );

  const filteredRows = useMemo(() => {
    if (!viewModel) return [] as MelProjectTableRow[];
    return viewModel.tableRows.filter((row) => {
      if (!rowMatchesSearch(row, search)) return false;
      if (dmFilter && row.dm !== dmFilter) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (stateFilter && row.state !== stateFilter) return false;
      return true;
    });
  }, [viewModel, search, dmFilter, statusFilter, stateFilter]);

  if (data === undefined) {
    return (
      <div className="space-y-6">
        <KpiSkeletonGrid />
        <MelProjectsSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <KpiCards items={kpiItems} />

      <section
        aria-labelledby="mel-projects-heading"
        className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
      >
        <div className="flex flex-col gap-2 border-b border-zinc-800/80 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-5">
          <div>
            <h2 id="mel-projects-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
              MEL projects
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Live data from the MEL projects Google Sheet CSV export.
            </p>
            {data.csvUrl ? (
              <p className="mt-2 break-all font-mono text-xs text-zinc-600">{data.csvUrl}</p>
            ) : null}
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span className="rounded-full border border-teal-500/25 bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-200">
              Live sheet
            </span>
            <p className="text-xs text-zinc-500">Fetched {formatFetchedAt(data.fetchedAt)}</p>
          </div>
        </div>

        {!data.ok ? (
          <div className="px-4 py-6 sm:px-5">
            <div
              role="alert"
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
            >
              <p className="font-medium text-amber-50">Could not load MEL projects</p>
              <p className="mt-2 text-amber-100/90">{data.error}</p>
            </div>
          </div>
        ) : !viewModel ? (
          <p className="px-4 py-6 text-sm text-zinc-500 sm:px-5">The sheet has no header row yet.</p>
        ) : (
          <>
            {viewModel.keys.missingColumns.length > 0 ? (
              <div className="border-b border-zinc-800/80 px-4 py-3 sm:px-5">
                <p className="text-xs text-amber-200/90">
                  Missing columns:{" "}
                  <span className="font-medium">{viewModel.keys.missingColumns.join(", ")}</span>.
                </p>
              </div>
            ) : null}

            <div className="border-b border-zinc-800/80 px-4 py-4 sm:px-5 sm:py-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Filter projects
              </p>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
                <div className="min-w-0 flex-1">
                  <label htmlFor="mel-search" className="mb-1.5 block text-xs font-medium text-zinc-400">
                    Search
                  </label>
                  <input
                    id="mel-search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search projects…"
                    className={inputClass}
                    autoComplete="off"
                  />
                </div>
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3 lg:max-w-3xl lg:flex-[1.2]">
                  <div>
                    <label htmlFor="mel-filter-dm" className="mb-1.5 block text-xs font-medium text-zinc-400">
                      DM
                    </label>
                    <select
                      id="mel-filter-dm"
                      value={dmFilter}
                      onChange={(e) => setDmFilter(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">All DMs</option>
                      {dmOptions.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="mel-filter-status"
                      className="mb-1.5 block text-xs font-medium text-zinc-400"
                    >
                      Status
                    </label>
                    <select
                      id="mel-filter-status"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className={selectClass}
                    >
                      <option value="">All statuses</option>
                      {statusOptions.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="mel-filter-state"
                      className="mb-1.5 block text-xs font-medium text-zinc-400"
                    >
                      State
                    </label>
                    <select
                      id="mel-filter-state"
                      value={stateFilter}
                      onChange={(e) => setStateFilter(e.target.value)}
                      className={selectClass}
                      disabled={stateOptions.length === 0}
                    >
                      <option value="">All states</option>
                      {stateOptions.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-4 pt-3 sm:px-5">
              <p className="text-sm tabular-nums text-zinc-300">
                <span className="font-medium text-zinc-100">{filteredRows.length}</span>
                {filteredRows.length === viewModel.tableRows.length ? (
                  <span className="text-zinc-500">
                    {" "}
                    {filteredRows.length === 1 ? "project" : "projects"}
                  </span>
                ) : (
                  <span className="text-zinc-500">
                    {" "}
                    of {viewModel.tableRows.length}{" "}
                    {viewModel.tableRows.length === 1 ? "project" : "projects"} match filters
                  </span>
                )}
              </p>
            </div>

            {filteredRows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-500 sm:px-5">
                No projects match your filters.
              </p>
            ) : (
              <div className="overflow-x-auto px-4 pb-4 sm:px-5">
                <table className="min-w-[720px] w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wide text-zinc-500">
                      <th className="min-w-[140px] px-3 py-3 font-medium sm:px-4">Project Name</th>
                      <th className="whitespace-nowrap px-3 py-3 font-medium sm:px-4">DM</th>
                      <th className="whitespace-nowrap px-3 py-3 text-right font-medium sm:px-4">
                        Rep Count
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 font-medium sm:px-4">Status</th>
                      <th className="whitespace-nowrap px-3 py-3 text-right font-medium sm:px-4">
                        Completion %
                      </th>
                      <th className="whitespace-nowrap px-3 py-3 text-right font-medium sm:px-4">
                        Open Calls
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {filteredRows.map((row, i) => (
                      <tr key={i} className="hover:bg-zinc-800/30">
                        <td className="max-w-[220px] whitespace-pre-wrap px-3 py-3 text-zinc-100 sm:px-4">
                          {row.projectName}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-zinc-300 sm:px-4">{row.dm}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-zinc-200 sm:px-4">
                          {row.repCount}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-zinc-300 sm:px-4">
                          {row.status}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-zinc-400 sm:px-4">
                          {formatCompletionDisplay(row.completionPercent)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-zinc-200 sm:px-4">
                          {row.openCalls}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
