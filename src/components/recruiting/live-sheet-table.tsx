"use client";

import type { SheetDataResult, SheetDataSuccess, SheetRow } from "@/lib/google-sheet-csv";
import { resolveKpiSheetColumnKeys } from "@/lib/sheet-kpi-metrics";
import { startTransition, useEffect, useMemo, useState } from "react";

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

function cell(row: SheetRow, key: string | undefined): string {
  if (!key) return "";
  return (row[key] ?? "").trim();
}

function uniqueSortedValues(rows: SheetRow[], columnKey: string | undefined): string[] {
  if (!columnKey) return [];
  const set = new Set<string>();
  for (const row of rows) {
    const v = cell(row, columnKey);
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function rowMatchesSearch(row: SheetRow, headers: string[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return headers.some((h) => (row[h] ?? "").toLowerCase().includes(q));
}

type LiveSheetTableViewProps = {
  data: SheetDataResult;
  drillSeq?: number;
  drillManager?: string | null;
};

function LiveSheetTableView({ data, drillSeq = 0, drillManager = null }: LiveSheetTableViewProps) {
  return (
    <section
      aria-labelledby="live-sheet-heading"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
    >
      <div className="flex flex-col gap-2 border-b border-zinc-800/80 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-5">
        <div>
          <h2 id="live-sheet-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
            Live Google Sheet (CSV)
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Pulled from the public CSV export URL on the server; refreshes about every 60 seconds.
          </p>
          <p className="mt-2 break-all font-mono text-xs text-zinc-600">{data.csvUrl}</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <span className="rounded-full border border-teal-500/25 bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-200">
            No Google API · free export
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
            <p className="font-medium text-amber-50">Could not load sheet rows</p>
            <p className="mt-2 text-amber-100/90">{data.error}</p>
          </div>
        </div>
      ) : data.headers.length === 0 ? (
        <p className="px-4 py-6 text-sm text-zinc-500 sm:px-5">The sheet has no header row yet.</p>
      ) : (
        <FilteredLiveSheetTable data={data} drillSeq={drillSeq} drillManager={drillManager} />
      )}
    </section>
  );
}

type FilteredLiveSheetTableProps = {
  data: SheetDataSuccess;
  drillSeq: number;
  drillManager: string | null;
};

function FilteredLiveSheetTable({ data, drillSeq, drillManager }: FilteredLiveSheetTableProps) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [managerFilter, setManagerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    if (drillSeq === 0) return;
    startTransition(() => {
      setManagerFilter(drillManager ?? "");
    });
  }, [drillSeq, drillManager]);

  const columnKeys = useMemo(
    () => resolveKpiSheetColumnKeys(data.headers),
    [data.headers],
  );

  const stateOptions = useMemo(
    () => uniqueSortedValues(data.rows, columnKeys.state),
    [data.rows, columnKeys.state],
  );
  const managerOptions = useMemo(
    () => uniqueSortedValues(data.rows, columnKeys.manager),
    [data.rows, columnKeys.manager],
  );
  const statusOptions = useMemo(
    () => uniqueSortedValues(data.rows, columnKeys.status),
    [data.rows, columnKeys.status],
  );

  const filteredRows = useMemo(() => {
    return data.rows.filter((row) => {
      if (!rowMatchesSearch(row, data.headers, search)) return false;
      if (stateFilter && cell(row, columnKeys.state) !== stateFilter) return false;
      if (managerFilter && cell(row, columnKeys.manager) !== managerFilter) return false;
      if (statusFilter && cell(row, columnKeys.status) !== statusFilter) return false;
      return true;
    });
  }, [
    data.rows,
    data.headers,
    search,
    stateFilter,
    managerFilter,
    statusFilter,
    columnKeys.state,
    columnKeys.manager,
    columnKeys.status,
  ]);

  const total = data.rows.length;
  const shown = filteredRows.length;

  return (
    <>
      <div className="border-b border-zinc-800/80 px-4 py-4 sm:px-5 sm:py-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Filter rows
        </p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
          <div className="min-w-0 flex-1">
            <label htmlFor="sheet-search" className="mb-1.5 block text-xs font-medium text-zinc-400">
              Search
            </label>
            <input
              id="sheet-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search all columns…"
              className={inputClass}
              autoComplete="off"
            />
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3 lg:max-w-3xl lg:flex-[1.2]">
            <div>
              <label htmlFor="sheet-filter-state" className="mb-1.5 block text-xs font-medium text-zinc-400">
                State
              </label>
              <select
                id="sheet-filter-state"
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className={selectClass}
                disabled={!columnKeys.state}
              >
                <option value="">All states</option>
                {stateOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sheet-filter-manager" className="mb-1.5 block text-xs font-medium text-zinc-400">
                Manager
              </label>
              <select
                id="sheet-filter-manager"
                value={managerFilter}
                onChange={(e) => setManagerFilter(e.target.value)}
                className={selectClass}
                disabled={!columnKeys.manager}
              >
                <option value="">All managers</option>
                {managerOptions.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sheet-filter-status" className="mb-1.5 block text-xs font-medium text-zinc-400">
                Status
              </label>
              <select
                id="sheet-filter-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={selectClass}
                disabled={!columnKeys.status}
              >
                <option value="">All statuses</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3 sm:px-5">
        <p className="text-sm tabular-nums text-zinc-300">
          <span className="font-medium text-zinc-100">{shown}</span>
          {shown === total ? (
            <span className="text-zinc-500"> {shown === 1 ? "row" : "rows"}</span>
          ) : (
            <span className="text-zinc-500">
              {" "}
              of {total} {total === 1 ? "row" : "rows"} match filters
            </span>
          )}
        </p>
      </div>

      <div className="overflow-x-auto px-4 pb-2 sm:px-5">
        <table className="min-w-[640px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wide text-zinc-500">
              {data.headers.map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3 font-medium sm:px-5">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {filteredRows.map((row, i) => (
              <tr key={i} className="hover:bg-zinc-800/30">
                {data.headers.map((h) => (
                  <td
                    key={`${i}-${h}`}
                    className="max-w-[280px] whitespace-pre-wrap px-4 py-2.5 text-zinc-200 sm:px-5"
                  >
                    {row[h] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-zinc-800/80 px-4 py-3 text-xs text-zinc-500 sm:px-5">
        {total} data row{total === 1 ? "" : "s"} in sheet
      </p>
    </>
  );
}

function LiveSheetSkeleton() {
  return (
    <section
      aria-labelledby="live-sheet-heading"
      aria-busy="true"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
    >
      <div className="flex flex-col gap-2 border-b border-zinc-800/80 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-5">
        <div className="min-w-0 flex-1 space-y-2">
          <h2 id="live-sheet-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
            Live Google Sheet (CSV)
          </h2>
          <div className="h-4 w-full max-w-md animate-pulse rounded bg-zinc-800/80" />
          <div className="h-3 w-full max-w-lg animate-pulse rounded bg-zinc-800/60" />
        </div>
        <div className="h-7 w-40 shrink-0 animate-pulse rounded-full bg-zinc-800/80" />
      </div>
      <div className="space-y-3 px-4 py-6 sm:px-5">
        <div className="h-10 w-full animate-pulse rounded-lg bg-zinc-800/50" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-zinc-800/40" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-zinc-800/30" />
      </div>
    </section>
  );
}

export type LiveSheetTableProps = {
  /** Increment together with `drillManager` to apply manager filter from DM drill-down. */
  drillSeq?: number;
  drillManager?: string | null;
};

export function LiveSheetTable({ drillSeq = 0, drillManager = null }: LiveSheetTableProps) {
  const [data, setData] = useState<SheetDataResult | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/recruiting-sheet", { cache: "no-store" });
        const parsed = (await res.json()) as SheetDataResult;
        if (!cancelled) {
          setData(parsed);
        }
      } catch (e) {
        if (!cancelled) {
          setData({
            ok: false,
            error: e instanceof Error ? e.message : "Network error while loading the sheet.",
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

  if (data === undefined) {
    return <LiveSheetSkeleton />;
  }

  return <LiveSheetTableView data={data} drillSeq={drillSeq} drillManager={drillManager} />;
}
