"use client";

import type { SheetDataResult } from "@/lib/google-sheet-csv";
import {
  computeMarketIntelligence,
  URGENCY_BADGE_STYLES,
  type CityMarketRow,
  type MarketIntelligenceSnapshot,
  type MarketRecommendation,
} from "@/lib/market-intelligence";
import type { MelProjectsDataResult } from "@/lib/mel-projects-sheet";
import { useMemo, type ReactNode } from "react";
import { IntelligenceBarChart } from "./intelligence-bar-chart";
import { IntelligenceDualChart } from "./intelligence-dual-chart";

type MarketIntelligenceSectionProps = {
  recruiting: SheetDataResult;
  mel: MelProjectsDataResult;
};

function RecommendationTags({ items }: { items: MarketRecommendation[] }) {
  if (items.length === 0) return <span className="text-zinc-500">—</span>;
  return (
    <ul className="flex flex-wrap gap-1">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-md border border-zinc-700/80 bg-zinc-950/60 px-2 py-0.5 text-[11px] text-zinc-300"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function SectionTable({
  title,
  description,
  headingId,
  children,
}: {
  title: string;
  description: string;
  headingId: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
    >
      <div className="border-b border-zinc-800/80 px-4 py-4 sm:px-5 sm:py-5">
        <h2 id={headingId} className="text-lg font-semibold tracking-tight text-zinc-50">
          {title}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function formatRatio(value: number | null): string {
  if (value === null) return "—";
  return value.toFixed(2);
}

function CityMarketTable({ rows }: { rows: CityMarketRow[] }) {
  if (rows.length === 0) {
    return <p className="px-4 py-8 text-sm text-zinc-500 sm:px-5">No cities match this view.</p>;
  }

  return (
    <table className="min-w-full text-left text-sm">
      <thead>
        <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
          <th className="px-4 py-3 font-medium sm:px-5">City</th>
          <th className="px-4 py-3 font-medium sm:px-5">Risk</th>
          <th className="px-4 py-3 font-medium sm:px-5">Urgency</th>
          <th className="hidden px-4 py-3 font-medium text-right md:table-cell sm:px-5">
            Open calls
          </th>
          <th className="hidden px-4 py-3 font-medium text-right lg:table-cell sm:px-5">Reps</th>
          <th className="px-4 py-3 font-medium text-right sm:px-5">Posts</th>
          <th className="px-4 py-3 font-medium text-right sm:px-5">Apps</th>
          <th className="hidden px-4 py-3 font-medium text-right md:table-cell sm:px-5">
            Apps / call
          </th>
          <th className="hidden px-4 py-3 font-medium text-right lg:table-cell sm:px-5">
            Done %
          </th>
          <th className="hidden px-4 py-3 font-medium text-right xl:table-cell sm:px-5">
            Coverage
          </th>
          <th className="hidden px-4 py-3 font-medium text-right xl:table-cell sm:px-5">
            Pressure
          </th>
          <th className="min-w-[11rem] px-4 py-3 font-medium sm:px-5">Recommendations</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-800/60">
        {rows.map((row) => (
          <tr key={`${row.city}-${row.stateCode}`} className="hover:bg-zinc-800/30">
            <td className="px-4 py-3 font-medium text-zinc-100 sm:px-5">
              {row.label}
              {row.isRural ? (
                <span className="ml-1.5 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-400">
                  Rural
                </span>
              ) : null}
            </td>
            <td className="px-4 py-3 font-semibold tabular-nums text-teal-300 sm:px-5">
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
            <td className="hidden px-4 py-3 text-right tabular-nums md:table-cell sm:px-5">
              {row.openStoreCalls}
            </td>
            <td className="hidden px-4 py-3 text-right tabular-nums lg:table-cell sm:px-5">
              {row.activeReps}
            </td>
            <td className="px-4 py-3 text-right tabular-nums sm:px-5">{row.openRecruitingPosts}</td>
            <td className="px-4 py-3 text-right tabular-nums sm:px-5">{row.applicants}</td>
            <td className="hidden px-4 py-3 text-right tabular-nums md:table-cell sm:px-5">
              {formatRatio(row.applicantsPerStoreCall)}
            </td>
            <td className="hidden px-4 py-3 text-right tabular-nums lg:table-cell sm:px-5">
              {row.completionPercent === null ? "—" : `${row.completionPercent}%`}
            </td>
            <td className="hidden px-4 py-3 text-right tabular-nums xl:table-cell sm:px-5">
              {row.nearbyRepCoverageEstimate}%
            </td>
            <td className="hidden px-4 py-3 text-right tabular-nums xl:table-cell sm:px-5">
              {row.staffingPressure}
            </td>
            <td className="px-4 py-3 sm:px-5">
              <RecommendationTags items={row.recommendations} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MarketIntelligenceSection({ recruiting, mel }: MarketIntelligenceSectionProps) {
  const snapshot = useMemo((): MarketIntelligenceSnapshot | null => {
    if (!recruiting.ok || !mel.ok) return null;
    return computeMarketIntelligence(recruiting.rows, recruiting.headers, mel.rows, mel.headers);
  }, [recruiting, mel]);

  if (!recruiting.ok || !mel.ok) {
    const errors = [
      !recruiting.ok ? `Recruiting: ${recruiting.error}` : null,
      !mel.ok ? `MEL: ${mel.error}` : null,
    ].filter(Boolean);

    return (
      <section className="space-y-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Market intelligence</h2>
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
    <div className="space-y-6 border-t border-zinc-800/80 pt-8">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Market intelligence</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          City-level join of MEL workload and recruiting pipeline — market risk scores, staffing
          pressure, and rep coverage estimates.
        </p>
        <p className="mt-2 text-xs text-zinc-600">{snapshot.columnHint}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <IntelligenceDualChart
          title="Store calls vs applicants"
          subtitle="Top cities by market risk"
          data={snapshot.storeCallsVsApplicants}
          primaryLabel="Open store calls"
          secondaryLabel="Applicants"
          primaryClassName="bg-violet-500/80"
          secondaryClassName="bg-sky-500/80"
        />
        <IntelligenceDualChart
          title="Rep coverage vs demand"
          subtitle="Nearby coverage % vs market risk score"
          data={snapshot.repCoverageVsDemand}
          primaryLabel="Rep coverage est."
          secondaryLabel="Risk score"
          primaryClassName="bg-teal-500/80"
          secondaryClassName="bg-rose-500/70"
        />
        <IntelligenceBarChart
          title="Top 15 critical markets"
          subtitle="Highest market risk scores by city"
          data={snapshot.topCriticalMarkets}
          valueLabel="risk"
          barClassName="bg-red-500/70"
        />
      </div>

      <SectionTable
        title="Cities needing recruiting"
        description="Top cities by market risk with open MEL workload or recruiting posts"
        headingId="cities-recruiting-heading"
      >
        <CityMarketTable rows={snapshot.citiesNeedingRecruiting} />
      </SectionTable>

      <SectionTable
        title="Cities with zero applicants"
        description="Markets with store or posting demand but no applicants yet"
        headingId="cities-zero-apps-heading"
      >
        <CityMarketTable rows={snapshot.zeroApplicantCities} />
      </SectionTable>

      <SectionTable
        title="Cities with highest staffing pressure"
        description="Open store calls per assigned rep (higher = more pressure)"
        headingId="cities-pressure-heading"
      >
        <CityMarketTable rows={snapshot.highestStaffingPressure} />
      </SectionTable>

      <SectionTable
        title="Rural markets with low rep coverage"
        description="Rural cities where nearby rep coverage estimate is under 40%"
        headingId="cities-rural-heading"
      >
        <CityMarketTable rows={snapshot.ruralLowCoverage} />
      </SectionTable>
    </div>
  );
}
