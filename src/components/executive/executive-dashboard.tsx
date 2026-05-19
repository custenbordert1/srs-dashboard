"use client";

import { AppShell } from "@/components/auth/app-shell";
import { IntelligenceBarChart } from "@/components/recruiting/intelligence-bar-chart";
import { RecruitingAutomationSection } from "@/components/recruiting/recruiting-automation-section";
import type { UserPublic } from "@/lib/auth/types";
import type { ExecutiveDashboardSnapshot } from "@/lib/dm-dashboard";
import { useTerritoryDashboard } from "@/hooks/use-territory-dashboard";

type ExecutiveDashboardProps = {
  user: UserPublic;
};

function TerritoryTable({
  title,
  rows,
}: {
  title: string;
  rows: ExecutiveDashboardSnapshot["bestTerritories"];
}) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No territory data.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">DM</th>
                <th className="pb-2 pr-3">Health</th>
                <th className="pb-2 pr-3">Jobs</th>
                <th className="pb-2 pr-3">7d apps</th>
                <th className="pb-2">Candidates</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.dmName} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 font-medium text-zinc-200">{row.dmName}</td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-300">
                    {row.healthScore}{" "}
                    <span className="text-xs text-zinc-500">({row.healthLabel})</span>
                  </td>
                  <td className="py-2 pr-3 text-zinc-400">{row.activeJobs}</td>
                  <td className="py-2 pr-3 text-zinc-400">{row.candidatesLast7Days}</td>
                  <td className="py-2 text-zinc-400">{row.candidates}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function ExecutiveDashboard({ user }: ExecutiveDashboardProps) {
  const { data, meta, error, loading, refreshing, refresh } =
    useTerritoryDashboard<ExecutiveDashboardSnapshot>({
      endpoint: "/api/executive/dashboard",
    });

  return (
    <AppShell
      user={user}
      title="Executive nationwide rollup"
      subtitle={`Nationwide health ${data?.nationwideHealthScore ?? "—"}/100 · live Breezy rollup`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          Best/worst territories, sources, fill-rate trends, weekly candidates
          {refreshing ? <span className="ml-2 text-teal-400/90">Updating…</span> : null}
        </p>
        <button
          type="button"
          onClick={refresh}
          disabled={loading || refreshing}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
        >
          {loading ? "Loading…" : refreshing ? "Refreshing…" : "Refresh now"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      {meta?.partialSync ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Partial Breezy sync — nationwide totals may be understated.
        </p>
      ) : null}

      {loading && !data ? <p className="text-sm text-zinc-500">Loading executive rollup…</p> : null}

      {data ? (
        <>
          <article className="rounded-2xl border border-teal-500/30 bg-teal-500/10 px-5 py-4">
            <p className="text-xs uppercase tracking-wide text-teal-200/80">Nationwide health</p>
            <p className="mt-1 text-4xl font-semibold tabular-nums text-teal-100">
              {data.nationwideHealthScore}
              <span className="text-lg text-teal-200/60">/100</span>
            </p>
          </article>

          <div className="grid gap-4 lg:grid-cols-2">
            <TerritoryTable title="Best territories" rows={data.bestTerritories} />
            <TerritoryTable title="Worst territories" rows={data.worstTerritories} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <IntelligenceBarChart
              title="Top recruiting sources"
              subtitle="Nationwide applicant sources"
              data={data.topRecruitingSources}
              barClassName="bg-violet-500/80"
            />
            <IntelligenceBarChart
              title="Fill-rate trends"
              subtitle="Pipeline stage distribution (%)"
              data={data.fillRateTrends}
              valueLabel="%"
              barClassName="bg-emerald-500/80"
            />
            <IntelligenceBarChart
              title="Total candidates by week"
              subtitle="Rolling 8-week applicant volume"
              data={data.candidatesByWeek}
              barClassName="bg-sky-500/80"
            />
          </div>

          <section className="border-t border-zinc-800/80 pt-8">
            <RecruitingAutomationSection />
          </section>

          <p className="text-xs text-zinc-600">
            Snapshot {new Date(data.fetchedAt).toLocaleString()} · {data.territoryRollups.length} DM territories
          </p>
        </>
      ) : null}
    </AppShell>
  );
}
