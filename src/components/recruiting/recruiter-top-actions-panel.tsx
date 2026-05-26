"use client";

import type { TopRecommendedAction } from "@/lib/recruiting-dashboard-ux/top-recommended-actions";

const URGENCY_STYLES: Record<TopRecommendedAction["urgency"], string> = {
  critical: "border-red-500/35 bg-red-500/10",
  high: "border-amber-500/35 bg-amber-500/10",
  medium: "border-zinc-700 bg-zinc-950/50",
  low: "border-zinc-800 bg-zinc-950/40",
};

type RecruiterTopActionsPanelProps = {
  actions: TopRecommendedAction[];
  title?: string;
  subtitle?: string;
};

export function RecruiterTopActionsPanel({
  actions,
  title = "Top recommended actions",
  subtitle = "Manual-only operational guidance — review before taking action in Job Management or the escalation queue.",
}: RecruiterTopActionsPanelProps) {
  return (
    <section className="rounded-2xl border border-teal-500/30 bg-gradient-to-br from-teal-500/10 to-zinc-950/40 p-4 sm:p-5">
      <header className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-300/90">
          Today&apos;s priorities
        </p>
        <h3 className="mt-1 text-base font-semibold text-zinc-50">{title}</h3>
        <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
      </header>
      {actions.length === 0 ? (
        <p className="text-sm text-zinc-500">No high-priority recommendations right now.</p>
      ) : (
        <ul className="space-y-2">
          {actions.map((action) => (
            <li
              key={action.id}
              className={`rounded-xl border px-3 py-2.5 text-sm ${URGENCY_STYLES[action.urgency]}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium text-zinc-100">{action.title}</p>
                <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase text-zinc-400">
                  {action.urgency} · manual
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-400">{action.reason}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-teal-400/80">
                Impact: {action.impactEstimate}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
