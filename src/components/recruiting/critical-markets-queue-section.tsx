"use client";

import type { SheetDataResult } from "@/lib/google-sheet-csv";
import {
  computeMarketIntelligence,
  URGENCY_BADGE_STYLES,
  type CityMarketRow,
  type MarketIntelligenceSnapshot,
  type MarketRecommendation,
  type MarketUrgency,
} from "@/lib/market-intelligence";
import type { MelProjectsDataResult } from "@/lib/mel-projects-sheet";
import { useMemo, useState } from "react";

type CriticalMarketsQueueSectionProps = {
  recruiting: SheetDataResult;
  mel: MelProjectsDataResult;
};

const ALL = "__all__";

const selectClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20";

const recommendationStyles: Record<MarketRecommendation, string> = {
  "Increase posts": "border-sky-500/25 bg-sky-500/10 text-sky-200",
  "Expand radius": "border-violet-500/25 bg-violet-500/10 text-violet-200",
  "Increase pay": "border-amber-500/25 bg-amber-500/10 text-amber-200",
  "Reassign reps": "border-teal-500/25 bg-teal-500/10 text-teal-200",
  "Escalate recruiting": "border-rose-500/25 bg-rose-500/10 text-rose-200",
};

function primaryAction(row: CityMarketRow): MarketRecommendation {
  return row.recommendations[0] ?? "Escalate recruiting";
}

function actionLabel(row: CityMarketRow): string {
  return primaryAction(row);
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function CriticalMarketCards({ rows }: { rows: CityMarketRow[] }) {
  return (
    <div className="space-y-3 md:hidden">
      {rows.map((row) => {
        const action = primaryAction(row);
        return (
          <article
            key={`${row.city}-${row.stateCode}`}
            className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-zinc-50">{row.city}</h3>
                <p className="text-sm text-zinc-500">
                  {row.stateCode} · {row.manager}
                </p>
              </div>
              <span
                className={[
                  "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                  URGENCY_BADGE_STYLES[row.urgency],
                ].join(" ")}
              >
                {row.urgency}
              </span>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wider text-zinc-500">Open calls</dt>
                <dd className="mt-1 font-semibold tabular-nums text-zinc-100">{row.openStoreCalls}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-zinc-500">Active reps</dt>
                <dd className="mt-1 font-semibold tabular-nums text-zinc-100">{row.activeReps}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-zinc-500">Open posts</dt>
                <dd className="mt-1 font-semibold tabular-nums text-zinc-100">
                  {row.openRecruitingPosts}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-zinc-500">Applicants</dt>
                <dd className="mt-1 font-semibold tabular-nums text-zinc-100">{row.applicants}</dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-md border border-teal-500/25 bg-teal-500/10 px-2 py-1 text-xs font-medium text-teal-200">
                Demand score {row.marketRiskScore}
              </span>
              <span
                className={[
                  "rounded-md border px-2 py-1 text-xs font-medium",
                  recommendationStyles[action],
                ].join(" ")}
              >
                {action}
              </span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function CriticalMarketsTable({ rows }: { rows: CityMarketRow[] }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
            <th className="px-4 py-3 font-medium sm:px-5">City</th>
            <th className="px-4 py-3 font-medium sm:px-5">State</th>
            <th className="px-4 py-3 font-medium sm:px-5">DM</th>
            <th className="px-4 py-3 font-medium text-right sm:px-5">Open store calls</th>
            <th className="px-4 py-3 font-medium text-right sm:px-5">Active reps</th>
            <th className="px-4 py-3 font-medium text-right sm:px-5">Open posts</th>
            <th className="px-4 py-3 font-medium text-right sm:px-5">Applicants</th>
            <th className="px-4 py-3 font-medium text-right sm:px-5">Demand score</th>
            <th className="px-4 py-3 font-medium sm:px-5">Risk level</th>
            <th className="min-w-[11rem] px-4 py-3 font-medium sm:px-5">Recommended action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {rows.map((row) => {
            const action = primaryAction(row);
            return (
              <tr key={`${row.city}-${row.stateCode}`} className="hover:bg-zinc-800/30">
                <td className="px-4 py-3 font-medium text-zinc-100 sm:px-5">{row.city}</td>
                <td className="px-4 py-3 text-zinc-300 sm:px-5">{row.stateCode}</td>
                <td className="px-4 py-3 text-zinc-400 sm:px-5">{row.manager}</td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-200 sm:px-5">
                  {row.openStoreCalls}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-200 sm:px-5">
                  {row.activeReps}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-200 sm:px-5">
                  {row.openRecruitingPosts}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-200 sm:px-5">
                  {row.applicants}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-teal-300 sm:px-5">
                  {row.marketRiskScore}
                </td>
                <td className="px-4 py-3 sm:px-5">
                  <span
                    className={[
                      "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                      URGENCY_BADGE_STYLES[row.urgency],
                    ].join(" ")}
                  >
                    {row.urgency}
                  </span>
                </td>
                <td className="px-4 py-3 sm:px-5">
                  <span
                    className={[
                      "inline-flex rounded-md border px-2 py-1 text-xs font-medium",
                      recommendationStyles[action],
                    ].join(" ")}
                  >
                    {actionLabel(row)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function filterCriticalMarkets(
  snapshot: MarketIntelligenceSnapshot,
  dmFilter: string,
  stateFilter: string,
  riskFilter: string,
): CityMarketRow[] {
  return snapshot.cities
    .filter((row) => row.openStoreCalls > 0 || row.openRecruitingPosts > 0)
    .filter((row) => dmFilter === ALL || row.manager === dmFilter)
    .filter((row) => stateFilter === ALL || row.stateCode === stateFilter)
    .filter((row) => riskFilter === ALL || row.urgency === riskFilter)
    .sort(
      (a, b) =>
        b.marketRiskScore - a.marketRiskScore ||
        b.openStoreCalls - a.openStoreCalls ||
        b.openRecruitingPosts - a.openRecruitingPosts,
    );
}

export function CriticalMarketsQueueSection({ recruiting, mel }: CriticalMarketsQueueSectionProps) {
  const [dmFilter, setDmFilter] = useState(ALL);
  const [stateFilter, setStateFilter] = useState(ALL);
  const [riskFilter, setRiskFilter] = useState(ALL);

  const snapshot = useMemo((): MarketIntelligenceSnapshot | null => {
    if (!recruiting.ok || !mel.ok) return null;
    return computeMarketIntelligence(recruiting.rows, recruiting.headers, mel.rows, mel.headers);
  }, [recruiting, mel]);

  const filteredRows = useMemo(() => {
    if (!snapshot) return [];
    return filterCriticalMarkets(snapshot, dmFilter, stateFilter, riskFilter);
  }, [dmFilter, riskFilter, snapshot, stateFilter]);

  const dmOptions = useMemo(() => {
    if (!snapshot) return [];
    return sortedUnique(snapshot.cities.map((row) => row.manager));
  }, [snapshot]);

  const stateOptions = useMemo(() => {
    if (!snapshot) return [];
    return sortedUnique(snapshot.cities.map((row) => row.stateCode));
  }, [snapshot]);

  if (!recruiting.ok || !mel.ok) {
    const errors = [
      !recruiting.ok ? `Recruiting: ${recruiting.error}` : null,
      !mel.ok ? `MEL: ${mel.error}` : null,
    ].filter(Boolean);

    return (
      <section className="space-y-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Critical markets queue</h2>
        <div
          role="alert"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          {errors.join(" · ")}
        </div>
      </section>
    );
  }

  if (!snapshot) return null;

  return (
    <section
      aria-labelledby="critical-markets-heading"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
    >
      <div className="flex flex-col gap-4 border-b border-zinc-800/80 px-4 py-4 sm:px-5 sm:py-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 id="critical-markets-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
            Critical markets queue
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Combined recruiting and MEL demand by city + state, sorted by highest market risk first.
          </p>
          <p className="mt-2 text-xs text-zinc-600">{snapshot.columnHint}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-sm text-zinc-400">
          <span className="font-semibold tabular-nums text-zinc-100">{filteredRows.length}</span>{" "}
          markets
        </div>
      </div>

      <div className="grid gap-3 border-b border-zinc-800/80 px-4 py-4 sm:grid-cols-3 sm:px-5">
        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">DM</span>
          <select className={selectClass} value={dmFilter} onChange={(e) => setDmFilter(e.target.value)}>
            <option value={ALL}>All DMs</option>
            {dmOptions.map((manager) => (
              <option key={manager} value={manager}>
                {manager}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">State</span>
          <select
            className={selectClass}
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
          >
            <option value={ALL}>All states</option>
            {stateOptions.map((stateCode) => (
              <option key={stateCode} value={stateCode}>
                {stateCode}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Risk level</span>
          <select
            className={selectClass}
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
          >
            <option value={ALL}>All risk levels</option>
            {(["Critical", "High", "Moderate", "Stable"] satisfies MarketUrgency[]).map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filteredRows.length === 0 ? (
        <p className="px-4 py-8 text-sm text-zinc-500 sm:px-5">
          No markets match the selected filters.
        </p>
      ) : (
        <div className="px-4 py-4 sm:px-5">
          <CriticalMarketCards rows={filteredRows} />
          <CriticalMarketsTable rows={filteredRows} />
        </div>
      )}
    </section>
  );
}
