"use client";

import type { CoverageRiskSnapshot, StaffingRiskLevel } from "@/lib/coverage-risk-engine";

const RISK_STYLES: Record<StaffingRiskLevel, string> = {
  GREEN: "text-emerald-300",
  YELLOW: "text-amber-300",
  RED: "text-red-300",
};

type DmCoverageRiskAlertsProps = {
  snapshot: CoverageRiskSnapshot;
};

export function DmCoverageRiskAlerts({ snapshot }: DmCoverageRiskAlertsProps) {
  const { highRiskProjects, noNearbyReps, recruitingUrgency, bestAvailableReps } = snapshot.dmAlerts;

  if (
    highRiskProjects.length === 0 &&
    noNearbyReps.length === 0 &&
    recruitingUrgency.length === 0
  ) {
    return null;
  }

  return (
    <section className="space-y-4 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5">
      <div>
        <h2 className="text-lg font-semibold text-zinc-50">Territory coverage alerts</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Staffing risk for open MEL projects in your territory — based on rep proximity, skills, and pipeline
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AlertList
          title="High-risk projects"
          emptyLabel="No high-risk projects in territory."
          rows={highRiskProjects}
        />
        <AlertList
          title="No nearby reps"
          emptyLabel="All open projects have active reps within 50 miles."
          rows={noNearbyReps}
        />
      </div>

      <AlertList
        title="Recruiting urgency"
        emptyLabel="No urgent recruiting signals."
        rows={recruitingUrgency}
        compact
      />

      {bestAvailableReps.length > 0 ? (
        <article className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-4">
          <p className="text-xs font-medium uppercase text-teal-200/80">Best available reps</p>
          <ul className="mt-3 space-y-2">
            {bestAvailableReps.map((item) => (
              <li
                key={item.opportunityId}
                className="flex flex-wrap items-start justify-between gap-2 border-t border-zinc-800/60 pt-2 first:border-0 first:pt-0 text-xs"
              >
                <div>
                  <p className="font-medium text-zinc-200">{item.projectName}</p>
                  <p className="text-zinc-500">
                    {item.storeName} · {item.state}{" "}
                    <span className={RISK_STYLES[item.staffingRisk]}>{item.staffingRisk}</span>
                  </p>
                </div>
                {item.topRep ? (
                  <div className="text-right">
                    <p className="font-medium text-teal-200">{item.topRep.repName}</p>
                    <p className="text-zinc-500">
                      {item.topRep.matchScore}% ·{" "}
                      {item.topRep.distanceMiles !== null ? `${item.topRep.distanceMiles} mi` : "—"}
                    </p>
                  </div>
                ) : (
                  <p className="text-amber-300">No rep match</p>
                )}
              </li>
            ))}
          </ul>
        </article>
      ) : null}
    </section>
  );
}

function AlertList({
  title,
  emptyLabel,
  rows,
  compact = false,
}: {
  title: string;
  emptyLabel: string;
  rows: CoverageRiskSnapshot["opportunities"];
  compact?: boolean;
}) {
  return (
    <article className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4">
      <p className="text-xs font-medium uppercase text-zinc-500">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">{emptyLabel}</p>
      ) : (
        <ul className={`mt-3 space-y-2 ${compact ? "max-h-48 overflow-y-auto" : ""}`}>
          {rows.map((row) => (
            <li
              key={row.opportunityId}
              className={`rounded-lg border px-3 py-2 text-xs ${
                row.staffingRisk === "RED"
                  ? "border-red-500/25 bg-red-500/10"
                  : "border-amber-500/25 bg-amber-500/10"
              }`}
            >
              <p className="font-medium text-zinc-200">{row.projectName}</p>
              <p className="mt-0.5 text-zinc-500">
                {row.storeName} · {row.city}, {row.state}
              </p>
              <p className="mt-1 text-[11px] text-zinc-400">{row.recommendedAction}</p>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
