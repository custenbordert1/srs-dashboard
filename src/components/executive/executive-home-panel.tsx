"use client";

import Link from "next/link";
import { AtsHealthCard } from "@/components/executive/ats-health-card";
import { RecruitingAlertsSection } from "@/components/recruiting/recruiting-alerts-section";
import type { ExecutiveDashboardSnapshot } from "@/lib/dm-dashboard";
import { useTerritoryDashboard } from "@/hooks/use-territory-dashboard";
import { useExecutiveAccountability } from "@/hooks/use-executive-accountability";

function KpiCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function TerritoryTable({
  title,
  rows,
}: {
  title: string;
  rows: ExecutiveDashboardSnapshot["worstTerritories"];
}) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No territory data.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">DM</th>
                <th className="pb-2 pr-3">Health</th>
                <th className="pb-2 pr-3">Jobs</th>
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

export function ExecutiveHomePanel() {
  const { data, loading, error } = useTerritoryDashboard<ExecutiveDashboardSnapshot>({
    endpoint: "/api/executive/dashboard",
  });
  const accountability = useExecutiveAccountability();

  const insights = data?.executiveInsights;
  const overdueCount = accountability.snapshot?.statusSummary.overdue ?? 0;
  const openActions = accountability.snapshot?.statusSummary.open ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Executive Home</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          Company-wide recruiting health, ATS reliability, territory risk, and accountability in one screen.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <KpiCard label="Open jobs" value={insights?.activeJobs ?? "—"} />
        <KpiCard label="Candidates" value={insights?.totalCandidates ?? "—"} />
        <KpiCard label="New hires YTD" value={insights?.hiresYtd ?? "—"} />
        <KpiCard
          label="Active recruiters"
          value={data?.territoryRollups.length ?? "—"}
          hint="DM territories tracked"
        />
        <KpiCard
          label="Critical territories"
          value={data?.worstTerritories.length ?? "—"}
          hint="Lowest health scores"
        />
        <KpiCard
          label="Coverage risk"
          value={insights ? `${insights.fillRiskScore}/100` : "—"}
          hint={insights?.fillRiskLabel}
        />
        <KpiCard
          label="Operational health"
          value={data ? `${data.nationwideHealthScore}/100` : "—"}
          hint="Nationwide rollup"
        />
      </div>

      <AtsHealthCard compact />

      <div className="grid gap-6 lg:grid-cols-2">
        <TerritoryTable title="Top 10 risk territories" rows={data?.worstTerritories ?? []} />
        <TerritoryTable title="Top 10 healthy territories" rows={data?.bestTerritories ?? []} />
      </div>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-50">Executive alerts & accountability</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {openActions} open actions · {overdueCount} overdue
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/?tab=executive-accountability&view=overdue"
              className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs text-red-100"
            >
              Overdue escalation
            </Link>
            <Link
              href="/?tab=executive-accountability"
              className="rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-xs text-teal-100"
            >
              Accountability board
            </Link>
          </div>
        </div>
        <div className="mt-4">
          <RecruitingAlertsSection limit={6} />
        </div>
      </section>

      {loading ? <p className="text-sm text-zinc-500">Loading executive rollup…</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
