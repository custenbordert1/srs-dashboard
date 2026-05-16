"use client";

import type { BreezyCandidatesResult } from "@/lib/breezy-api";
import type { SheetDataResult } from "@/lib/google-sheet-csv";
import type { MelProjectsDataResult } from "@/lib/mel-projects-sheet";
import {
  buildRecruitingForecast,
  FORECAST_URGENCY_BADGE_STYLES,
  type ForecastHorizonDays,
  type ForecastMarketRow,
  type ForecastProjectRiskRow,
} from "@/lib/recruiting-forecast";
import { useEffect, useMemo, useState } from "react";
import { IntelligenceBarChart } from "./intelligence-bar-chart";
import { KpiCards } from "./kpi-cards";

type ForecastIntelligenceSectionProps = {
  recruiting: SheetDataResult;
  mel: MelProjectsDataResult;
};

const HORIZONS: ForecastHorizonDays[] = [7, 14, 30];

function ForecastSkeleton() {
  return (
    <section className="space-y-6 border-t border-zinc-800/80 pt-8">
      <div className="h-7 w-56 animate-pulse rounded bg-zinc-800/80" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-900/40"
          />
        ))}
      </div>
    </section>
  );
}

function formatDays(days: number | null): string {
  if (days === null) return "—";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  return `${days}d`;
}

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value}%`;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 font-semibold tabular-nums text-zinc-100">{value}</p>
    </div>
  );
}

function RecommendationTags({ recommendations }: { recommendations: string[] }) {
  if (recommendations.length === 0) {
    return <span className="text-xs text-zinc-500">No action recommended</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {recommendations.map((recommendation) => (
        <span
          key={recommendation}
          className="rounded-md border border-teal-500/25 bg-teal-500/10 px-2 py-1 text-xs font-medium text-teal-200"
        >
          {recommendation}
        </span>
      ))}
    </div>
  );
}

function ForecastCards({ rows }: { rows: ForecastMarketRow[] }) {
  return (
    <div className="space-y-3 lg:hidden">
      {rows.map((row) => (
        <article
          key={`${row.market}-${row.horizonDays}`}
          className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-zinc-50">{row.market}</h3>
              <p className="text-sm text-zinc-500">{row.dm}</p>
            </div>
            <span
              className={[
                "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                FORECAST_URGENCY_BADGE_STYLES[row.urgency],
              ].join(" ")}
            >
              {row.urgency}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Metric label="Risk" value={row.forecastRiskScore} />
            <Metric label="Demand" value={row.projectedDemand} />
            <Metric label="Rep shortage" value={row.projectedRepShortage} />
            <Metric label="Applicant gap" value={row.projectedApplicantShortage} />
          </div>
          <div className="mt-4">
            <RecommendationTags recommendations={row.recommendations} />
          </div>
        </article>
      ))}
    </div>
  );
}

function ForecastTable({ rows }: { rows: ForecastMarketRow[] }) {
  return (
    <div className="hidden overflow-x-auto lg:block">
      <table className="min-w-[1180px] w-full text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
            <th className="px-4 py-3 font-medium sm:px-5">Market</th>
            <th className="px-4 py-3 font-medium sm:px-5">Urgency</th>
            <th className="px-4 py-3 font-medium sm:px-5">DM</th>
            <th className="px-4 py-3 font-medium text-right sm:px-5">Risk</th>
            <th className="px-4 py-3 font-medium text-right sm:px-5">Demand</th>
            <th className="px-4 py-3 font-medium text-right sm:px-5">Applicants</th>
            <th className="px-4 py-3 font-medium text-right sm:px-5">Rep coverage</th>
            <th className="px-4 py-3 font-medium text-right sm:px-5">Rep shortage</th>
            <th className="px-4 py-3 font-medium text-right sm:px-5">Applicant gap</th>
            <th className="px-4 py-3 font-medium sm:px-5">Deadline</th>
            <th className="px-4 py-3 font-medium sm:px-5">Recommendations</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/60">
          {rows.map((row) => (
            <tr key={`${row.market}-${row.horizonDays}`} className="hover:bg-zinc-800/30">
              <td className="px-4 py-3 font-medium text-zinc-100 sm:px-5">{row.market}</td>
              <td className="px-4 py-3 sm:px-5">
                <span
                  className={[
                    "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                    FORECAST_URGENCY_BADGE_STYLES[row.urgency],
                  ].join(" ")}
                >
                  {row.urgency}
                </span>
              </td>
              <td className="px-4 py-3 text-zinc-400 sm:px-5">{row.dm}</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums text-teal-300 sm:px-5">
                {row.forecastRiskScore}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-zinc-300 sm:px-5">
                {row.projectedDemand}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-zinc-300 sm:px-5">
                {row.projectedApplicants}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-zinc-300 sm:px-5">
                {row.projectedRepCoverage}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-zinc-300 sm:px-5">
                {row.projectedRepShortage}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-zinc-300 sm:px-5">
                {row.projectedApplicantShortage}
              </td>
              <td className="px-4 py-3 text-zinc-400 sm:px-5">
                {formatDays(row.nearestDeadlineDays)}
              </td>
              <td className="px-4 py-3 sm:px-5">
                <RecommendationTags recommendations={row.recommendations} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProjectRiskTable({ rows }: { rows: ForecastProjectRiskRow[] }) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm">
      <div className="border-b border-zinc-800/80 px-4 py-4 sm:px-5">
        <h3 className="text-lg font-semibold tracking-tight text-zinc-50">Projects at risk</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Projects forecasted to miss completion or staffing targets.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-sm text-zinc-500 sm:px-5">No at-risk projects detected.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium sm:px-5">Project</th>
                <th className="px-4 py-3 font-medium sm:px-5">Market</th>
                <th className="px-4 py-3 font-medium sm:px-5">Urgency</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Risk</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Open calls</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Active reps</th>
                <th className="px-4 py-3 font-medium text-right sm:px-5">Completion</th>
                <th className="px-4 py-3 font-medium sm:px-5">Deadline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {rows.map((row) => (
                <tr key={`${row.projectNo}-${row.market}`} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 sm:px-5">
                    <p className="font-medium text-zinc-100">{row.projectName}</p>
                    <p className="text-xs text-zinc-500">{row.projectNo}</p>
                  </td>
                  <td className="px-4 py-3 text-zinc-300 sm:px-5">{row.market}</td>
                  <td className="px-4 py-3 sm:px-5">
                    <span
                      className={[
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                        FORECAST_URGENCY_BADGE_STYLES[row.urgency],
                      ].join(" ")}
                    >
                      {row.urgency}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-teal-300 sm:px-5">
                    {row.forecastRiskScore}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-300 sm:px-5">
                    {row.openStoreCalls}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-300 sm:px-5">
                    {row.activeReps}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-300 sm:px-5">
                    {formatPercent(row.completionPercent)}
                  </td>
                  <td className="px-4 py-3 text-zinc-400 sm:px-5">
                    {formatDays(row.nearestDeadlineDays)}
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

export function ForecastIntelligenceSection({ recruiting, mel }: ForecastIntelligenceSectionProps) {
  const [candidateData, setCandidateData] = useState<BreezyCandidatesResult | undefined>(undefined);
  const [horizon, setHorizon] = useState<ForecastHorizonDays>(14);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/breezy/candidates", { cache: "no-store" });
        const parsed = (await res.json()) as BreezyCandidatesResult;
        if (!cancelled) setCandidateData(parsed);
      } catch (err) {
        if (!cancelled) {
          setCandidateData({
            ok: false,
            error: err instanceof Error ? err.message : "Failed to load Breezy candidates",
            fetchedAt: new Date().toISOString(),
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
    if (!recruiting.ok || !mel.ok || !candidateData?.ok) return null;
    return buildRecruitingForecast({
      recruitingRows: recruiting.rows,
      recruitingHeaders: recruiting.headers,
      melRows: mel.rows,
      melHeaders: mel.headers,
      candidates: candidateData.candidates,
    });
  }, [candidateData, mel, recruiting]);

  const selectedRows = useMemo(() => {
    if (!snapshot) return [];
    if (horizon === 7) return snapshot.forecast7Day.slice(0, 25);
    if (horizon === 14) return snapshot.forecast14Day.slice(0, 25);
    return snapshot.forecast30Day.slice(0, 25);
  }, [horizon, snapshot]);

  if (candidateData === undefined) return <ForecastSkeleton />;

  if (!recruiting.ok || !mel.ok || !candidateData.ok) {
    const message =
      !recruiting.ok
        ? recruiting.error
        : !mel.ok
          ? mel.error
          : candidateData.ok
            ? "Forecast data unavailable"
            : candidateData.error;
    return (
      <section className="space-y-4 border-t border-zinc-800/80 pt-8">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Forecast intelligence</h2>
        <div
          role="alert"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
        >
          {message}
        </div>
      </section>
    );
  }

  if (!snapshot) return null;

  return (
    <section className="space-y-6 border-t border-zinc-800/80 pt-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Forecast intelligence</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Predictive staffing risk using MEL demand, recruiting activity, Breezy candidate
            conversion, deadlines, active reps, and zero-applicant trends.
          </p>
          <p className="mt-2 text-xs text-zinc-600">{snapshot.columnHint}</p>
        </div>
        <div className="flex rounded-xl border border-zinc-800 bg-zinc-950/50 p-1">
          {HORIZONS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setHorizon(days)}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                horizon === days
                  ? "bg-teal-500/15 text-teal-200"
                  : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100",
              ].join(" ")}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      <KpiCards items={snapshot.kpis} gridClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" />

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
        <IntelligenceBarChart
          title="Demand trend forecast"
          data={snapshot.demandTrendForecast}
          valueLabel="avg demand"
          barClassName="bg-orange-500/80"
        />
        <IntelligenceBarChart
          title="Applicant trend forecast"
          data={snapshot.applicantTrendForecast}
          valueLabel="avg applicants"
          barClassName="bg-sky-500/80"
        />
        <IntelligenceBarChart
          title="Rep coverage trend"
          data={snapshot.repCoverageTrend}
          valueLabel="avg reps"
          barClassName="bg-emerald-500/80"
        />
        <IntelligenceBarChart
          title="Staffing risk trend"
          data={snapshot.staffingRiskTrend}
          valueLabel="avg score"
          barClassName="bg-red-500/80"
        />
      </div>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm">
        <div className="border-b border-zinc-800/80 px-4 py-4 sm:px-5">
          <h3 className="text-lg font-semibold tracking-tight text-zinc-50">
            {horizon}-day staffing forecast
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            Markets most likely to fail staffing, sorted by Forecast Risk Score.
          </p>
        </div>
        {selectedRows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-zinc-500 sm:px-5">No forecast risks detected.</p>
        ) : (
          <div className="p-4 sm:p-5">
            <ForecastCards rows={selectedRows} />
            <ForecastTable rows={selectedRows} />
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <ProjectRiskTable rows={snapshot.projectsAtRisk} />
        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
          <h3 className="text-lg font-semibold tracking-tight text-zinc-50">
            Future critical recruiting markets
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            30-day markets projected to become critical without intervention.
          </p>
          <div className="mt-4 space-y-3">
            {snapshot.futureCriticalRecruitingMarkets.slice(0, 10).map((row) => (
              <div
                key={row.market}
                className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-zinc-100">{row.market}</p>
                    <p className="text-xs text-zinc-500">{row.dm}</p>
                  </div>
                  <span className="font-semibold tabular-nums text-teal-300">
                    {row.forecastRiskScore}
                  </span>
                </div>
                <div className="mt-3">
                  <RecommendationTags recommendations={row.recommendations} />
                </div>
              </div>
            ))}
            {snapshot.futureCriticalRecruitingMarkets.length === 0 ? (
              <p className="text-sm text-zinc-500">No future critical markets detected.</p>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}
