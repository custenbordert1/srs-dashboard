"use client";

import type { RecruiterScorecard } from "@/lib/recruiter-dashboard";

type RecruiterDashboardScorecardProps = {
  scorecard: RecruiterScorecard;
};

export function RecruiterDashboardScorecard({ scorecard }: RecruiterDashboardScorecardProps) {
  const rows = [
    { label: "Candidates owned", value: scorecard.candidatesOwned.toString() },
    { label: "Tasks completed", value: scorecard.tasksCompleted.toString() },
    {
      label: "Response time",
      value: scorecard.responseTimeHours !== null ? `${scorecard.responseTimeHours}h avg` : "—",
    },
    { label: "Stages moved", value: scorecard.stagesMoved.toString() },
    { label: "Ready for MEL", value: scorecard.readyForMel.toString() },
  ];

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-zinc-50">Recruiter scorecard</h2>
      <p className="mt-1 text-sm text-zinc-500">{scorecard.recruiter}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {rows.map((row) => (
          <div key={row.label} className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{row.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-50">{row.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
