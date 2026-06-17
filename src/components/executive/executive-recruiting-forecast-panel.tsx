"use client";

import { useExecutiveRecruitingForecast } from "@/hooks/use-executive-recruiting-forecast";
import type { CapacityStatus, DataTrustLevel } from "@/lib/executive-recruiting-forecast";
import { TabSkeleton } from "@/components/ui/tab-skeleton";

const TRUST_STYLES: Record<DataTrustLevel, string> = {
  high: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  partial: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  degraded: "border-red-500/30 bg-red-500/10 text-red-100",
};

const CAPACITY_STYLES: Record<CapacityStatus, string> = {
  overloaded: "text-red-200",
  stable: "text-teal-200",
  underused: "text-zinc-300",
};

function KpiCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function ExecutiveRecruitingForecastPanel() {
  const { snapshot, loading, error, timedOut, refresh } = useExecutiveRecruitingForecast();

  if (loading && !snapshot) {
    return <TabSkeleton message="Loading executive recruiting forecast…" cards={4} rows={4} />;
  }

  if (error && !snapshot) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-6 text-sm text-red-100">
        <p>{error}</p>
        <button
          type="button"
          onClick={() => refresh()}
          className="mt-3 rounded-lg border border-red-400/40 px-3 py-1.5 text-xs font-medium hover:bg-red-500/20"
        >
          {timedOut ? "Retry forecast" : "Refresh"}
        </button>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-8 text-center text-sm text-zinc-400">
        Forecast data is not available yet. Refresh once Breezy and MEL caches are warm.
      </div>
    );
  }

  const trustLabel =
    snapshot.dataTrust === "high"
      ? "High confidence"
      : snapshot.dataTrust === "partial"
        ? "Partial data"
        : "Degraded data";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Executive Recruiting Forecast</h2>
          <p className="mt-1 text-sm text-zinc-500">
            30 / 60 / 90-day hiring outlook, capacity pressure, and territory risk — cache-first, deterministic.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={loading}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
        >
          Refresh forecast
        </button>
      </div>

      <div className={`rounded-lg border px-4 py-3 text-sm ${TRUST_STYLES[snapshot.dataTrust]}`}>
        <span className="font-semibold">{trustLabel}</span>
        {snapshot.partialSync ? " · Breezy sync may be partial" : null}
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs opacity-90">
          {snapshot.assumptions.slice(0, 4).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Projected hires (30d)" value={snapshot.kpis.projectedHires30} />
        <KpiCard label="Projected hires (60d)" value={snapshot.kpis.projectedHires60} />
        <KpiCard label="Projected hires (90d)" value={snapshot.kpis.projectedHires90} />
        <KpiCard
          label="Applicants (90d)"
          value={snapshot.kpis.projectedApplicants90}
          hint="Trailing velocity × job pressure"
        />
        <KpiCard label="Territories at risk" value={snapshot.kpis.territoriesAtRisk} />
        <KpiCard label="Projects at risk" value={snapshot.kpis.projectsAtRisk} />
        <KpiCard label="Overloaded recruiters" value={snapshot.kpis.overloadedRecruiters} />
        <KpiCard label="Overloaded DMs" value={snapshot.kpis.overloadedDms} />
      </div>

      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">Hiring forecast by horizon</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">Horizon</th>
                <th className="pb-2 pr-3">Hires</th>
                <th className="pb-2 pr-3">Applicants</th>
                <th className="pb-2 pr-3">Interviews</th>
                <th className="pb-2">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.hiringForecasts.map((row) => (
                <tr key={row.horizonDays} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 font-medium text-zinc-200">{row.horizonDays} days</td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-300">{row.projectedHires}</td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-300">{row.projectedApplicants}</td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-300">{row.projectedInterviews}</td>
                  <td className="py-2 tabular-nums text-zinc-400">{row.confidencePercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">Predicted hires by week (90-day horizon)</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {snapshot.weeklyHireForecast.slice(0, 12).map((week) => (
            <div key={week.weekLabel} className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-2 py-2 text-center">
              <p className="text-[10px] uppercase text-zinc-500">{week.weekLabel}</p>
              <p className="text-lg font-semibold tabular-nums text-teal-200">{week.projectedHires}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-200">Territory shortage forecast</h3>
          {snapshot.territoryShortages.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No elevated territory shortages detected.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {snapshot.territoryShortages.slice(0, 8).map((row) => (
                <li key={`${row.dmName}-${row.territoryLabel}`} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-zinc-200">{row.dmName}</p>
                    <span className="text-xs tabular-nums text-amber-200">Risk {row.shortageScore}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{row.territoryLabel}</p>
                  <p className="mt-1 text-xs text-zinc-400">{row.reasons.join(" · ")}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          <h3 className="text-sm font-semibold text-zinc-200">Executive recommendations</h3>
          {snapshot.recommendations.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No urgent recommendations — capacity is stable.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {snapshot.recommendations.slice(0, 8).map((rec) => (
                <li key={rec.id} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-zinc-200">{rec.title}</p>
                    <span className="text-[10px] uppercase text-zinc-500">{rec.priority}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-400">{rec.rationale}</p>
                  <p className="mt-1 text-xs text-teal-300/90">{rec.expectedImpact}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
        <h3 className="text-sm font-semibold text-zinc-200">Recruiter & DM capacity</h3>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-zinc-500">Recruiters</p>
            <ul className="mt-2 space-y-2">
              {snapshot.recruiterCapacity.slice(0, 6).map((row) => (
                <li key={row.recruiter} className="flex justify-between text-sm">
                  <span className="text-zinc-300">{row.recruiter}</span>
                  <span className={CAPACITY_STYLES[row.status]}>
                    {row.capacityScore} · {row.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs uppercase text-zinc-500">DMs</p>
            <ul className="mt-2 space-y-2">
              {snapshot.dmCapacity.slice(0, 6).map((row) => (
                <li key={row.dmName} className="flex justify-between text-sm">
                  <span className="text-zinc-300">{row.dmName}</span>
                  <span className={CAPACITY_STYLES[row.status]}>
                    {row.capacityScore} · {row.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
