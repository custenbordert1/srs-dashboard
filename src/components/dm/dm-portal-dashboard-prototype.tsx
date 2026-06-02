"use client";

import type { DmViewVisibility } from "@/lib/dm-portal/dm-view-mode";
import { buildDmPortalCardMetrics } from "@/lib/dm-portal/dm-portal-metrics";
import type { DmDashboardSnapshot } from "@/lib/dm-dashboard";
import type { DmPrioritizedAlert } from "@/lib/dm-dashboard/dm-alert-priority";

type DmPortalDashboardPrototypeProps = {
  data: DmDashboardSnapshot;
  visibility: DmViewVisibility;
  territoryLabel: string;
};

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <article className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-4 py-4 shadow-sm shadow-black/10">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-50">{value}</p>
      <p className="mt-2 text-[11px] leading-snug text-zinc-500">{hint}</p>
    </article>
  );
}

function NeedsAttentionList({ alerts }: { alerts: DmPrioritizedAlert[] }) {
  const top = alerts.slice(0, 8);
  if (top.length === 0) {
    return <p className="text-sm text-zinc-500">No territory alerts right now.</p>;
  }
  return (
    <ul className="divide-y divide-zinc-800/80">
      {top.map((alert) => (
        <li key={alert.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
          <div>
            <p className="text-sm font-medium text-zinc-100">{alert.title}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{alert.detail}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              alert.priority === "critical"
                ? "bg-red-500/20 text-red-200"
                : alert.priority === "high"
                  ? "bg-amber-500/20 text-amber-100"
                  : "bg-zinc-700/60 text-zinc-300"
            }`}
          >
            {alert.priority}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DmPortalDashboardPrototype({
  data,
  visibility,
  territoryLabel,
}: DmPortalDashboardPrototypeProps) {
  const metrics = buildDmPortalCardMetrics(data);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-teal-500/25 bg-teal-500/5 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-300/90">DM portal · prototype</p>
        <p className="mt-1 text-sm text-zinc-300">
          Territory-scoped view for <span className="font-medium text-zinc-100">{data.dmName}</span> ·{" "}
          {territoryLabel}
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibility.showOpenJobs ? (
          <MetricCard
            label="Open jobs"
            value={metrics.openJobs.toLocaleString()}
            hint="Published positions in your assigned states"
          />
        ) : null}
        {visibility.showApplicantCounts ? (
          <MetricCard
            label="Applicants"
            value={metrics.applicants.toLocaleString()}
            hint="New applicants in the last 7 days"
          />
        ) : null}
        {visibility.showOpenOpportunities ? (
          <MetricCard
            label="Open calls"
            value={metrics.openCalls.toLocaleString()}
            hint="Open opportunity demand in your territory"
          />
        ) : null}
        {visibility.showActiveReps ? (
          <MetricCard
            label="Active reps"
            value={metrics.activeReps.toLocaleString()}
            hint="Onboarded reps and hired pipeline (proxy until rep roster is on DM API)"
          />
        ) : null}
        {visibility.showCoveragePercent ? (
          <MetricCard
            label="Coverage %"
            value={`${metrics.coveragePercent}%`}
            hint={`Territory health · ${data.health.label}`}
          />
        ) : null}
        {visibility.showNeedsAttention ? (
          <MetricCard
            label="Needs attention"
            value={metrics.needsAttention.toLocaleString()}
            hint={`${data.alertSummary.criticalCount} critical · ${data.alertSummary.highCount} high priority`}
          />
        ) : null}
      </section>

      {visibility.showNeedsAttention ? (
        <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-4">
          <h2 className="text-sm font-semibold text-zinc-100">Needs attention</h2>
          <p className="mt-1 text-xs text-zinc-500">Top prioritized alerts for your territory only.</p>
          <div className="mt-3">
            <NeedsAttentionList alerts={data.prioritizedAlerts} />
          </div>
        </section>
      ) : null}

      <p className="text-xs text-zinc-600">
        Snapshot {new Date(data.fetchedAt).toLocaleString()} · DM view mode · no cross-territory rollup
      </p>
    </div>
  );
}
