"use client";

import { useState } from "react";
import type { RecruiterProductivityByPeriod, RecruiterProductivityPeriod } from "@/lib/recruiter-dashboard";

const PERIOD_LABEL: Record<RecruiterProductivityPeriod, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
};

const METRIC_ROWS: Array<{ key: keyof RecruiterProductivityByPeriod["today"]; label: string }> = [
  { key: "candidatesContacted", label: "Candidates contacted" },
  { key: "interviewsScheduled", label: "Interviews scheduled" },
  { key: "paperworkSent", label: "Paperwork sent" },
  { key: "paperworkCompleted", label: "Paperwork completed" },
  { key: "readyForMel", label: "Ready for MEL" },
  { key: "hires", label: "Hires" },
];

function trendIndicator(current: number, prior: number): string {
  if (current > prior) return "↑";
  if (current < prior) return "↓";
  return "→";
}

type RecruiterDashboardProductivityProps = {
  productivity: RecruiterProductivityByPeriod;
};

export function RecruiterDashboardProductivity({ productivity }: RecruiterDashboardProductivityProps) {
  const [period, setPeriod] = useState<RecruiterProductivityPeriod>("today");
  const snapshot = productivity[period];
  const prior =
    period === "today"
      ? productivity.week
      : period === "week"
        ? productivity.month
        : productivity.month;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Productivity</h2>
          <p className="mt-1 text-sm text-zinc-500">Execution metrics for your owned pipeline.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-1">
          {(Object.keys(PERIOD_LABEL) as RecruiterProductivityPeriod[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriod(key)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                period === key
                  ? "bg-teal-500/15 text-teal-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {PERIOD_LABEL[key]}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {METRIC_ROWS.map((row) => (
          <div key={row.key} className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{row.label}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <p className="text-2xl font-semibold tabular-nums text-zinc-50">{snapshot[row.key]}</p>
              <span className="text-xs text-zinc-500" title="Simple trend vs broader period">
                {trendIndicator(snapshot[row.key], prior[row.key])}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
