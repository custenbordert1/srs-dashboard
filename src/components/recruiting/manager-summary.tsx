"use client";

import type { SheetDataResult } from "@/lib/google-sheet-csv";
import { fetchRecruitingSheetData } from "@/lib/dashboard-api-client";
import { computeManagerSheetStats } from "@/lib/manager-sheet-stats";
import { useEffect, useMemo, useState } from "react";

type ManagerSummaryProps = {
  managerName: string | null;
  onClear: () => void;
};

function ManagerSummarySkeleton() {
  return (
    <section
      aria-labelledby="manager-summary-heading"
      aria-busy="true"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5"
    >
      <div className="h-6 w-56 animate-pulse rounded bg-zinc-800/80" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((k) => (
          <div key={k} className="h-16 animate-pulse rounded-xl bg-zinc-800/40" />
        ))}
      </div>
    </section>
  );
}

export function ManagerSummary({ managerName, onClear }: ManagerSummaryProps) {
  const [data, setData] = useState<SheetDataResult | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const parsed = await fetchRecruitingSheetData();
        if (!cancelled) setData(parsed);
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

  const stats = useMemo(() => {
    if (!managerName || !data?.ok || data.headers.length === 0) return null;
    return computeManagerSheetStats(data.rows, data.headers, managerName);
  }, [data, managerName]);

  if (!managerName) {
    return (
      <section
        aria-labelledby="manager-summary-heading"
        className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:px-5 sm:py-5"
      >
        <h2 id="manager-summary-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
          Manager summary
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Click a manager name in the Needs attention queue to filter the recruiting sheet (archive) and see stats
          here.
        </p>
      </section>
    );
  }

  if (data === undefined) {
    return <ManagerSummarySkeleton />;
  }

  if (!data.ok) {
    return (
      <section
        aria-labelledby="manager-summary-heading"
        className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:px-5 sm:py-5"
      >
        <h2 id="manager-summary-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
          Manager summary
        </h2>
        <p className="mt-2 text-sm text-zinc-500">{data.error}</p>
      </section>
    );
  }

  if (!stats) {
    return null;
  }

  const breezyDisplay =
    stats.breezyLinkedPercent === null ? "—" : `${stats.breezyLinkedPercent}%`;

  return (
    <section
      aria-labelledby="manager-summary-heading"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
    >
      <div className="flex flex-col gap-3 border-b border-zinc-800/80 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-5">
        <div>
          <h2 id="manager-summary-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
            Manager summary
          </h2>
          <p className="mt-1 text-sm font-medium text-teal-200/90">{stats.managerName}</p>
          <p className="mt-1 text-xs text-zinc-500">
            Open posts = Status Open or Requested (same as KPIs). Recruiting sheet (archive) filtered to this manager.
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded-lg border border-zinc-600 bg-zinc-800/60 px-3 py-2 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800"
        >
          Clear manager filter
        </button>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total open posts</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">
            {stats.totalOpenPosts.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Zero applicant posts</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-rose-200">
            {stats.zeroApplicantPosts.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total applicants</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">
            {stats.totalApplicants.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Breezy linked %</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{breezyDisplay}</p>
          {stats.breezyLinkedPercent !== null ? (
            <p className="mt-1 text-xs text-zinc-500">
              {stats.breezyLinkedCount} of {stats.totalOpenPosts} open posts
            </p>
          ) : (
            <p className="mt-1 text-xs text-zinc-500">BreezyHR Linked column not mapped</p>
          )}
        </div>
      </div>
    </section>
  );
}
