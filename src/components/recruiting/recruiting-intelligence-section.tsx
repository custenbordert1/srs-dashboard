"use client";

import type { SheetDataResult } from "@/lib/google-sheet-csv";
import type { MelProjectsDataResult } from "@/lib/mel-projects-sheet";
import {
  analyzeMarketIdentityQuality,
  type MarketIdentityDiagnostics,
} from "@/lib/market-identity";
import type { Kpi } from "@/lib/recruiting-sample-data";
import {
  computeRecruitingIntelligence,
  intelligenceSnapshotToKpis,
  RISK_BADGE_STYLES,
  type IntelligenceOpenPost,
} from "@/lib/recruiting-intelligence";
import { useEffect, useMemo, useState } from "react";
import { CandidateIntelligenceSection } from "./candidate-intelligence-section";
import { CriticalMarketsQueueSection } from "./critical-markets-queue-section";
import { DemandIntelligenceSection } from "./demand-intelligence-section";
import { ForecastIntelligenceSection } from "./forecast-intelligence-section";
import { MarketIntelligenceSection } from "./market-intelligence-section";
import { IntelligenceBarChart } from "./intelligence-bar-chart";
import { KpiCards } from "./kpi-cards";
import { OpportunityAutomationSection } from "./opportunity-automation-section";
import { RecruitingActionCenterSection } from "./recruiting-action-center-section";

function formatDaysOpen(days: number | null): string {
  if (days === null) return "—";
  return `${days}d`;
}

function IntelligenceSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-900/40"
          />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-900/40" />
    </div>
  );
}

function APlusOpportunityTable({ rows }: { rows: IntelligenceOpenPost[] }) {
  return (
    <section
      aria-labelledby="aplus-heading"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm"
    >
      <div className="border-b border-zinc-800/80 px-4 py-4 sm:px-5 sm:py-5">
        <h2 id="aplus-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
          A+ Opportunity queue
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Prioritized open posts: zero applicants, open over 7 days, high location footprint (same
          title), and rural states.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-sm text-zinc-500 sm:px-5">
          No A+ opportunities match the current criteria on open posts.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium sm:px-5">Score</th>
                <th className="px-4 py-3 font-medium sm:px-5">Risk</th>
                <th className="px-4 py-3 font-medium sm:px-5">Job title</th>
                <th className="px-4 py-3 font-medium sm:px-5">Location</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell sm:px-5">DM</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Apps</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Days</th>
                <th className="hidden px-4 py-3 font-medium text-right lg:table-cell sm:px-5">
                  Stores
                </th>
                <th className="hidden px-4 py-3 font-medium text-right sm:table-cell sm:px-5">
                  Openings
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {rows.map((row, index) => (
                <tr key={`${row.jobTitle}-${row.city}-${row.state}-${index}`} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 font-semibold tabular-nums text-teal-300 sm:px-5">
                    {row.aPlusScore}
                  </td>
                  <td className="px-4 py-3 sm:px-5">
                    <span
                      className={[
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                        RISK_BADGE_STYLES[row.riskLevel],
                      ].join(" ")}
                    >
                      {row.riskLevel}
                    </span>
                  </td>
                  <td className="max-w-[14rem] px-4 py-3 font-medium text-zinc-100 sm:max-w-xs sm:px-5">
                    <span className="line-clamp-2">{row.jobTitle}</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-300 sm:px-5">
                    {row.city}, {row.state}
                    {row.isRural ? (
                      <span className="ml-1.5 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-400">
                        Rural
                      </span>
                    ) : null}
                  </td>
                  <td className="hidden px-4 py-3 text-zinc-400 md:table-cell sm:px-5">{row.manager}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-200 sm:px-5">
                    {row.applicantCount}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-400 sm:px-5">
                    {formatDaysOpen(row.daysOpen)}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums text-zinc-400 lg:table-cell sm:px-5">
                    {row.storeCount}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums text-zinc-400 sm:table-cell sm:px-5">
                    {row.openings}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function RecruitingIntelligenceSection() {
  const [data, setData] = useState<SheetDataResult | undefined>(undefined);
  const [melData, setMelData] = useState<MelProjectsDataResult | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [recruitingRes, melRes] = await Promise.all([
          fetch("/api/recruiting-sheet", { cache: "no-store" }),
          fetch("/api/mel-projects", { cache: "no-store" }),
        ]);
        const parsed = (await recruitingRes.json()) as SheetDataResult;
        const melParsed = (await melRes.json()) as MelProjectsDataResult;
        if (!cancelled) {
          setData(parsed);
          setMelData(melParsed);
        }
      } catch (e) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : "Failed to load data";
          setData({
            ok: false,
            error: message,
            fetchedAt: new Date().toISOString(),
            csvUrl: "",
          });
          setMelData({
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

  const snapshot = useMemo(() => {
    if (!data?.ok) return null;
    return computeRecruitingIntelligence(data.rows, data.headers);
  }, [data]);

  const kpiItems = useMemo(() => {
    if (!data) return [];
    if (!data.ok) return intelligenceSnapshotToKpis(emptySnapshot(), data.error);
    if (!snapshot) return [];
    return intelligenceSnapshotToKpis(snapshot);
  }, [data, snapshot]);

  const dataQualityDiagnostics = useMemo<MarketIdentityDiagnostics | null>(() => {
    if (!data?.ok || !melData?.ok) return null;
    return analyzeMarketIdentityQuality({
      recruitingRows: data.rows,
      recruitingHeaders: data.headers,
      melRows: melData.rows,
      melHeaders: melData.headers,
    });
  }, [data, melData]);

  const dataQualityKpis = useMemo<Kpi[]>(() => {
    if (!dataQualityDiagnostics) return [];
    return [
      {
        id: "matched-market-pct",
        label: "Matched market %",
        value: `${dataQualityDiagnostics.matchedMarketPercent}%`,
        change: "Identity",
        changeDirection: "flat",
        hint: `${dataQualityDiagnostics.matchedRows.toLocaleString()} of ${dataQualityDiagnostics.totalRows.toLocaleString()} rows have complete matched market identity`,
      },
      {
        id: "unmatched-rows",
        label: "Unmatched rows",
        value: dataQualityDiagnostics.unmatchedRows.toLocaleString(),
        change: "Quality",
        changeDirection: dataQualityDiagnostics.unmatchedRows > 0 ? "down" : "flat",
        hint: `${dataQualityDiagnostics.incompleteRows.toLocaleString()} incomplete · ${dataQualityDiagnostics.unmatchedMarkets.length.toLocaleString()} unmatched market examples`,
      },
      {
        id: "duplicate-markets",
        label: "Duplicate market count",
        value: dataQualityDiagnostics.duplicateMarketCount.toLocaleString(),
        change: "Normalized",
        changeDirection: "flat",
        hint: "City + state keys with multiple source rows after normalization",
      },
    ];
  }, [dataQualityDiagnostics]);

  if (data === undefined || melData === undefined) {
    return <IntelligenceSkeleton />;
  }

  if (!data.ok) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Recruiting intelligence</h1>
        <div
          role="alert"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          {data.error}
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return <IntelligenceSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Recruiting intelligence</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          Live analytics from the recruiting Google Sheet — scorecards, risk scoring, and prioritized
          opportunities for field recruiting.
        </p>
      </div>

      <KpiCards
        items={kpiItems}
        gridClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      />

      {dataQualityKpis.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Data quality</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Market identity diagnostics across recruiting and MEL sources.
            </p>
          </div>
          <KpiCards
            items={dataQualityKpis}
            gridClassName="grid gap-3 sm:grid-cols-3"
          />
          {dataQualityDiagnostics ? (
            <div className="grid gap-3 text-sm md:grid-cols-3">
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3">
                <p className="font-medium text-zinc-300">Unmatched markets</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {dataQualityDiagnostics.unmatchedMarkets.slice(0, 5).join(", ") || "None"}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3">
                <p className="font-medium text-zinc-300">Unmatched DMs</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {dataQualityDiagnostics.unmatchedDms.slice(0, 5).join(", ") || "None"}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3">
                <p className="font-medium text-zinc-300">Incomplete rows</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {dataQualityDiagnostics.incompleteRows.toLocaleString()} rows missing city or state
                </p>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <IntelligenceBarChart
          title="Applicants by state"
          subtitle="Total applicants on open posts"
          data={snapshot.applicantsByState}
          valueLabel="applicants"
          barClassName="bg-sky-500/80"
        />
        <IntelligenceBarChart
          title="Openings by DM"
          subtitle="Open post count by hiring manager"
          data={snapshot.openingsByManager}
          valueLabel="openings"
          barClassName="bg-teal-500/80"
        />
        <IntelligenceBarChart
          title="Zero applicant trend"
          subtitle="Zero-applicant posts by week opened"
          data={snapshot.zeroApplicantTrend}
          valueLabel="posts"
          barClassName="bg-rose-500/70"
        />
      </div>

      <APlusOpportunityTable rows={snapshot.aPlusOpportunities} />

      <CriticalMarketsQueueSection recruiting={data} mel={melData} />

      <OpportunityAutomationSection recruiting={data} mel={melData} />

      <RecruitingActionCenterSection recruiting={data} mel={melData} />

      <ForecastIntelligenceSection recruiting={data} mel={melData} />

      <CandidateIntelligenceSection />

      <MarketIntelligenceSection recruiting={data} mel={melData} />

      <DemandIntelligenceSection recruiting={data} mel={melData} />
    </div>
  );
}

function emptySnapshot() {
  return computeRecruitingIntelligence([], []);
}
