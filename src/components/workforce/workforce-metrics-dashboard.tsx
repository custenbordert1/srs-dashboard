"use client";

import { IntelligenceBarChart } from "@/components/recruiting/intelligence-bar-chart";
import type { WorkforceImportStats } from "@/lib/workforce-intelligence/workforce-csv-import";

type WorkforceMetricsDashboardProps = {
  stats: WorkforceImportStats;
};

export function WorkforceMetricsDashboard({ stats }: WorkforceMetricsDashboardProps) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-zinc-50">Workforce metrics</h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Active roster" value={stats.totalReps} />
        <MetricCard label="Active imported" value={stats.activeCount} tone="emerald" />
        <MetricCard label="Inactive archived" value={stats.inactiveCount} tone="amber" />
        <MetricCard label="Terminated archived" value={stats.terminatedCount} tone="amber" />
        <MetricCard label="States covered" value={stats.statesCovered} />
        <MetricCard label="Unique skills" value={stats.uniqueSkillSets} />
        <MetricCard label="Recent logins (14d)" value={stats.recentLoginCount} tone="teal" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <IntelligenceBarChart
          title="Rep density by state"
          subtitle="Active roster distribution"
          data={stats.stateBreakdown.slice(0, 10).map((r) => ({ label: r.state, value: r.count }))}
          barClassName="bg-sky-500/80"
        />
        <IntelligenceBarChart
          title="Skill set breakdown"
          subtitle="Top skills in imported roster"
          data={stats.skillBreakdown.map((r) => ({ label: r.skill, value: r.count }))}
          barClassName="bg-violet-500/80"
        />
      </div>

      {stats.stateBreakdown.filter((r) => r.count < 2).length > 0 ? (
        <article className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <p className="text-xs font-medium uppercase text-amber-200/80">Coverage gaps</p>
          <p className="mt-1 text-sm text-zinc-400">
            Thin coverage in{" "}
            {stats.stateBreakdown
              .filter((r) => r.count < 2)
              .slice(0, 8)
              .map((r) => `${r.state} (${r.count})`)
              .join(", ")}
            . Consider targeted recruiting or rep activation in these states.
          </p>
        </article>
      ) : null}

      <article className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
        <p className="text-xs font-medium uppercase text-red-200/80">Coverage signal</p>
        <p className="mt-1 text-sm text-zinc-400">
          {stats.inactiveCount > stats.activeCount * 0.3
            ? "High inactive ratio — review roster before staffing high-priority MEL opportunities."
            : stats.statesCovered < 5
              ? "Limited state coverage — expand recruiting radius for open opportunities."
              : "Roster coverage looks balanced for territory staffing analysis."}
        </p>
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
  tone?: "zinc" | "emerald" | "amber" | "teal";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-200"
      : tone === "amber"
        ? "text-amber-200"
        : tone === "teal"
          ? "text-teal-200"
          : "text-zinc-50";
  return (
    <article className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </article>
  );
}
