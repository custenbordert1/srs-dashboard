"use client";

import { IntelligenceBarChart } from "@/components/recruiting/intelligence-bar-chart";
import type { CoverageRiskSnapshot, StaffingRiskLevel } from "@/lib/coverage-risk-engine";

const RISK_STYLES: Record<StaffingRiskLevel, string> = {
  GREEN: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  YELLOW: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  RED: "border-red-500/30 bg-red-500/10 text-red-200",
};

type CoverageRiskExecutivePanelProps = {
  snapshot: CoverageRiskSnapshot;
};

export function CoverageRiskExecutivePanel({ snapshot }: CoverageRiskExecutivePanelProps) {
  const summary = snapshot.executiveSummary;
  const topRisks = snapshot.opportunities.filter((o) => o.staffingRisk === "RED").slice(0, 8);

  return (
    <section className="space-y-4 rounded-2xl border border-red-500/20 bg-zinc-900/40 p-5">
      <div>
        <h2 className="text-lg font-semibold text-zinc-50">Coverage risk intelligence</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Predictive staffing risk across open MEL projects — rep proximity, skills, activity, and pipeline
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="High-risk projects" value={summary.highRiskProjectCount} tone="red" />
        <MetricCard label="Zero nearby reps" value={summary.zeroNearbyRepProjects} tone="amber" />
        <MetricCard label="Open opportunities" value={summary.totalOpenOpportunities} />
        <MetricCard label="Avg MEL coverage score" value={summary.averageCoverageScore} />
        <MetricCard label="Yellow risk" value={summary.yellowRiskProjectCount} tone="amber" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <IntelligenceBarChart
          title="States with low staffing density"
          subtitle="Open MEL vs active reps"
          data={summary.lowDensityStates.slice(0, 8).map((r) => ({
            label: r.state,
            value: Math.round(r.densityRatio * 100),
          }))}
          barClassName="bg-red-500/70"
        />
        <IntelligenceBarChart
          title="High opportunity / low rep markets"
          subtitle="Gap score by state"
          data={summary.highOpportunityLowRepMarkets.slice(0, 8).map((r) => ({
            label: r.state,
            value: r.gapScore,
          }))}
          barClassName="bg-amber-500/70"
        />
      </div>

      <article className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4">
        <p className="text-xs font-medium uppercase text-zinc-500">Highest-risk projects</p>
        {topRisks.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No high-risk open projects in scope.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {topRisks.map((row) => (
              <li
                key={row.opportunityId}
                className={`rounded-lg border px-3 py-2 text-xs ${RISK_STYLES[row.staffingRisk]}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{row.projectName}</p>
                    <p className="mt-0.5 opacity-80">
                      {row.storeName} · {row.city}, {row.state} · {row.territoryOwner}
                    </p>
                  </div>
                  <div className="text-right tabular-nums">
                    <p className="font-semibold">{row.coverageScore}% coverage</p>
                    <p className="text-[10px] opacity-80">
                      {row.nearby.activeWithin50} active / 50mi · {row.nearby.within25} / 25mi
                    </p>
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] opacity-90">{row.recommendedAction}</p>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}

function MetricCard({
  label,
  value,
  tone = "zinc",
}: {
  label: string;
  value: number;
  tone?: "zinc" | "red" | "amber";
}) {
  const toneClass =
    tone === "red" ? "text-red-200" : tone === "amber" ? "text-amber-200" : "text-zinc-50";
  return (
    <article className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </article>
  );
}
