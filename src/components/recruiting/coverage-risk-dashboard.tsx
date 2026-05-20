"use client";

import type { RepIntelligenceSnapshot } from "@/lib/rep-intelligence/rep-types";

const HEALTH_STYLES = {
  green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  yellow: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  red: "border-red-500/30 bg-red-500/10 text-red-200",
} as const;

type CoverageRiskDashboardProps = {
  snapshot: Pick<
    RepIntelligenceSnapshot,
    "coverageGaps" | "highRiskProjects" | "unstaffedOpportunities" | "territoryStaffingScore"
  >;
};

export function CoverageRiskDashboard({ snapshot }: CoverageRiskDashboardProps) {
  return (
    <section className="rounded-xl border border-red-500/15 bg-zinc-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Coverage risk dashboard</h3>
          <p className="mt-1 text-xs text-zinc-500">Territory gaps, high-risk projects, and unstaffed stores</p>
        </div>
        <div className="rounded-lg border border-zinc-700/80 bg-zinc-950 px-3 py-1.5 text-right">
          <p className="text-[10px] uppercase text-zinc-500">Staffing score</p>
          <p className="text-xl font-semibold tabular-nums text-zinc-100">{snapshot.territoryStaffingScore}/100</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <article className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 p-3">
          <p className="text-xs font-medium uppercase text-zinc-500">Territory gaps</p>
          <ul className="mt-2 space-y-2">
            {snapshot.coverageGaps.length === 0 ? (
              <li className="text-xs text-zinc-500">No major gaps</li>
            ) : (
              snapshot.coverageGaps.map((gap) => (
                <li
                  key={gap.territory}
                  className={`rounded-md border px-2 py-1.5 text-xs ${HEALTH_STYLES[gap.health]}`}
                >
                  <span className="font-medium">{gap.territory}</span>
                  <span className="block text-[10px] opacity-80">
                    {gap.openProjects} open · {gap.activeReps} reps · gap {gap.gapScore}
                  </span>
                </li>
              ))
            )}
          </ul>
        </article>

        <article className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 p-3">
          <p className="text-xs font-medium uppercase text-zinc-500">High-risk projects</p>
          <ul className="mt-2 space-y-1.5 text-xs text-zinc-400">
            {snapshot.highRiskProjects.slice(0, 6).map((p) => (
              <li key={`${p.projectName}-${p.state}`}>
                <span className="text-zinc-200">{p.projectName}</span> — risk {p.riskScore}, fill{" "}
                {p.fillProbability}%
                {p.bestRepName ? ` · ${p.bestRepName}` : ""}
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 p-3">
          <p className="text-xs font-medium uppercase text-zinc-500">Unstaffed opportunities</p>
          <ul className="mt-2 space-y-1.5 text-xs text-zinc-400">
            {snapshot.unstaffedOpportunities.slice(0, 6).map((o) => (
              <li key={`${o.projectName}-${o.storeName}`}>
                <span className="text-zinc-200">{o.storeName}</span> · {o.client} · {o.state}
                <span className="ml-1 rounded bg-amber-500/15 px-1 text-[10px] text-amber-200">{o.priority}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
