"use client";

import {
  buildDmScorecards,
  type DmScorecardRow,
} from "@/lib/dm-scorecard-metrics";
import { fetchMelProjectsData, fetchRecruitingSheetData } from "@/lib/dashboard-api-client";
import type { SheetDataResult } from "@/lib/google-sheet-csv";
import type { MelProjectsDataResult } from "@/lib/mel-projects-sheet";
import type { DmLeaderboardRow } from "@/lib/recruiting-sample-data";
import { useEffect, useMemo, useState } from "react";

function RankBadge({ rank }: { rank: number }) {
  const tone =
    rank === 1
      ? "bg-amber-500/20 text-amber-200 ring-amber-500/30"
      : rank === 2
        ? "bg-zinc-400/15 text-zinc-200 ring-zinc-400/25"
        : rank === 3
          ? "bg-orange-700/25 text-orange-200 ring-orange-600/30"
          : "bg-zinc-800 text-zinc-300 ring-zinc-700/40";
  return (
    <span
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums ring-1 ${tone}`}
    >
      {rank}
    </span>
  );
}

function ScorecardSkeleton() {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 sm:p-5">
      <p className="text-sm text-zinc-500">Loading DM scorecards (recruiting sheet archive + MEL projects)…</p>
      <div className="mt-3 h-5 w-40 animate-pulse rounded bg-zinc-800/80" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-zinc-800/50" />
        ))}
      </div>
    </section>
  );
}

function statesLabel(states: string[]): string {
  return states.length > 0 ? states.join(", ") : "—";
}

function DmScorecardTable({ rows }: { rows: DmScorecardRow[] }) {
  return (
    <section
      aria-labelledby="dm-heading"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
    >
      <div className="border-b border-zinc-800/80 px-4 py-4 sm:px-5 sm:py-5">
        <h2 id="dm-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
          DM scorecards
        </h2>
        <p className="text-sm text-zinc-500">
          Recruiting sheet archive and MEL demand metrics by mapped district manager territory
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-4 py-3 font-medium sm:px-5">Rank</th>
              <th className="px-4 py-3 font-medium sm:px-5">DM</th>
              <th className="px-4 py-3 font-medium sm:px-5">Assigned states</th>
              <th className="px-4 py-3 font-medium text-right sm:px-5">Open posts</th>
              <th className="px-4 py-3 font-medium text-right sm:px-5">Zero apps</th>
              <th className="px-4 py-3 font-medium text-right sm:px-5">Applicants</th>
              <th className="px-4 py-3 font-medium text-right sm:px-5">MEL open calls</th>
              <th className="px-4 py-3 font-medium text-right sm:px-5">Active reps</th>
              <th className="px-4 py-3 font-medium text-right sm:px-5">Demand score</th>
              <th className="px-4 py-3 font-medium text-right sm:px-5">Critical markets</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {rows.map((row) => (
              <tr key={row.manager} className="hover:bg-zinc-800/30">
                <td className="px-4 py-3 sm:px-5">
                  <RankBadge rank={row.rank} />
                </td>
                <td className="px-4 py-3 font-medium text-zinc-100 sm:px-5">{row.manager}</td>
                <td className="max-w-xs px-4 py-3 text-xs text-zinc-400 sm:px-5">
                  {statesLabel(row.assignedStates)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-200 sm:px-5">
                  {row.openPosts.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-200 sm:px-5">
                  {row.zeroApplicantPosts.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-200 sm:px-5">
                  {row.totalApplicants.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-200 sm:px-5">
                  {row.melOpenStoreCalls.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-200 sm:px-5">
                  {row.activeReps.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right sm:px-5">
                  <span className="inline-flex min-w-[2.5rem] justify-end rounded-md bg-teal-500/15 px-2 py-1 text-sm font-semibold tabular-nums text-teal-200 ring-1 ring-teal-500/25">
                    {row.demandScore}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-200 sm:px-5">
                  {row.criticalMarketsCount.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function DmLeaderboard({ rows = [] }: { rows?: DmLeaderboardRow[] }) {
  void rows;
  const [recruiting, setRecruiting] = useState<SheetDataResult | undefined>(undefined);
  const [mel, setMel] = useState<MelProjectsDataResult | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [recruitingJson, melJson] = await Promise.all([
          fetchRecruitingSheetData(),
          fetchMelProjectsData(),
        ]);
        if (!cancelled) {
          setRecruiting(recruitingJson);
          setMel(melJson);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load DM scorecards";
        if (!cancelled) {
          setRecruiting({
            ok: false,
            error: message,
            fetchedAt: new Date().toISOString(),
            csvUrl: "",
          });
          setMel({
            ok: false,
            error: message,
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

  const scorecards = useMemo(() => {
    if (!recruiting?.ok || !mel?.ok) return [];
    return buildDmScorecards(recruiting.rows, recruiting.headers, mel.rows, mel.headers);
  }, [mel, recruiting]);

  if (recruiting === undefined || mel === undefined) return <ScorecardSkeleton />;

  if (!recruiting.ok || !mel.ok) {
    const errorMessage = !recruiting.ok
      ? recruiting.error
      : !mel.ok
        ? mel.error
        : "Failed to load DM scorecards";

    return (
      <section className="space-y-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">DM scorecards</h2>
        <p className="text-sm text-zinc-500">
          Combines archive recruiting Google Sheet rows with MEL project demand — not live Breezy KPIs.
        </p>
        <div
          role="alert"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          {errorMessage}
        </div>
      </section>
    );
  }

  if (scorecards.length === 0) {
    return (
      <section className="space-y-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">DM scorecards</h2>
        <p className="text-sm text-zinc-500">
          Sheet and MEL data loaded but no district manager rows matched. Check Google Sheet column headers and MEL
          project mapping.
        </p>
      </section>
    );
  }

  return <DmScorecardTable rows={scorecards} />;
}
