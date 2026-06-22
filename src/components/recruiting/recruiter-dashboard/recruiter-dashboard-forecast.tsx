"use client";

import type { RecruiterHiringForecast } from "@/lib/recruiter-dashboard";

type RecruiterDashboardForecastProps = {
  forecast: RecruiterHiringForecast;
};

export function RecruiterDashboardForecast({ forecast }: RecruiterDashboardForecastProps) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-zinc-50">Hiring forecast</h2>
      <p className="mt-1 text-sm text-zinc-500">{forecast.assumptions}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-200/80">
            Expected Ready for MEL (7 days)
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-teal-100">
            {forecast.readyForMel7d}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Expected Ready for MEL (30 days)
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-50">
            {forecast.readyForMel30d}
          </p>
        </div>
      </div>
    </section>
  );
}
