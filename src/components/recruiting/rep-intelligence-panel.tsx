"use client";

import type { RepIntelligenceSnapshot } from "@/lib/rep-intelligence/rep-types";

const HEALTH_STYLES = {
  green: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  yellow: "text-amber-200 border-amber-500/30 bg-amber-500/10",
  red: "text-red-200 border-red-500/30 bg-red-500/10",
} as const;

type RepIntelligencePanelProps = {
  snapshot: RepIntelligenceSnapshot;
  compact?: boolean;
};

export function RepIntelligencePanel({ snapshot, compact = false }: RepIntelligencePanelProps) {
  return (
    <section className="rounded-2xl border border-sky-500/20 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Workforce & rep intelligence</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Active rep coverage, utilization, and project staffing matches (read-only)
          </p>
        </div>
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-right">
          <p className="text-[10px] uppercase text-sky-200/70">Territory staffing</p>
          <p className="text-2xl font-semibold tabular-nums text-sky-100">
            {snapshot.territoryStaffingScore}
            <span className="text-sm text-sky-200/60">/100</span>
          </p>
        </div>
      </div>

      <div className={`mt-4 grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        <article className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3">
          <p className="text-xs uppercase text-zinc-500">Active reps</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-50">{snapshot.activeReps.filter((r) => r.active).length}</p>
        </article>
        <article className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3">
          <p className="text-xs uppercase text-zinc-500">Unstaffed opportunities</p>
          <p className="mt-1 text-2xl font-semibold text-amber-200">{snapshot.unstaffedOpportunities.length}</p>
        </article>
        <article className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3">
          <p className="text-xs uppercase text-zinc-500">High-risk projects</p>
          <p className="mt-1 text-2xl font-semibold text-red-200">{snapshot.highRiskProjects.length}</p>
        </article>
        <article className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3">
          <p className="text-xs uppercase text-zinc-500">Coverage gaps</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-200">{snapshot.coverageGaps.length}</p>
        </article>
      </div>

      {snapshot.bestRepPerProject.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase text-zinc-500">Best rep per open project</p>
          <ul className="mt-2 space-y-2">
            {snapshot.bestRepPerProject.slice(0, compact ? 5 : 8).map((row) => (
              <li
                key={`${row.projectName}-${row.repId}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-zinc-200">{row.projectName}</p>
                  <p className="text-xs text-zinc-500">{row.client}</p>
                </div>
                <div className="text-right text-xs">
                  <p className="font-medium text-teal-200">{row.repName}</p>
                  <p className="tabular-nums text-zinc-500">
                    {row.matchScore}% · {row.distanceMiles !== null ? `${row.distanceMiles} mi` : "—"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!compact && snapshot.coverageGaps.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase text-zinc-500">Coverage gaps by territory</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {snapshot.coverageGaps.map((gap) => (
              <li
                key={gap.territory}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${HEALTH_STYLES[gap.health]}`}
              >
                {gap.territory}: {gap.openProjects} open / {gap.activeReps} reps
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!compact && snapshot.highRiskProjects.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">Project</th>
                <th className="pb-2 pr-3">Risk</th>
                <th className="pb-2 pr-3">Fill prob.</th>
                <th className="pb-2">Best rep</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.highRiskProjects.map((row) => (
                <tr key={`${row.projectName}-${row.state}`} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 text-zinc-300">
                    {row.projectName}
                    <span className="block text-xs text-zinc-600">{row.client}</span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-red-200">{row.riskScore}</td>
                  <td className="py-2 pr-3 tabular-nums text-amber-200">{row.fillProbability}%</td>
                  <td className="py-2 text-zinc-400">{row.bestRepName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
