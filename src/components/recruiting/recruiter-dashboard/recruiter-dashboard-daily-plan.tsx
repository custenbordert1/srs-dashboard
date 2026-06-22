"use client";

import Link from "next/link";
import type { RecruiterDailyPlanAction } from "@/lib/recruiter-dashboard";

type RecruiterDashboardDailyPlanProps = {
  actions: RecruiterDailyPlanAction[];
};

export function RecruiterDashboardDailyPlan({ actions }: RecruiterDashboardDailyPlanProps) {
  return (
    <section className="rounded-2xl border border-teal-500/25 bg-gradient-to-br from-teal-500/10 via-zinc-900/60 to-zinc-900/40 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-zinc-50">AI daily plan</h2>
      <p className="mt-1 text-sm text-zinc-400">Top actions for today — ranked from your inbox priorities.</p>
      {actions.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No prioritized actions right now. Check back after sync.</p>
      ) : (
        <ol className="mt-4 space-y-2">
          {actions.map((action, index) => (
            <li key={action.id}>
              <Link
                href={action.href}
                className="flex items-center gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2.5 text-sm text-zinc-200 hover:border-teal-500/40 hover:bg-teal-500/10"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-xs font-semibold text-teal-100">
                  {index + 1}
                </span>
                {action.label}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
