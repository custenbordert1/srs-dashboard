"use client";

import Link from "next/link";
import type { RecruiterPipelineCard } from "@/lib/recruiter-dashboard";

type RecruiterDashboardPipelineProps = {
  cards: RecruiterPipelineCard[];
};

export function RecruiterDashboardPipeline({ cards }: RecruiterDashboardPipelineProps) {
  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-zinc-50">Pipeline</h2>
      <p className="mt-1 text-sm text-zinc-500">Your owned candidates by stage.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.id}
            href={card.href}
            className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4 hover:border-teal-500/40 hover:bg-teal-500/5"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-zinc-200">{card.label}</p>
              {card.agingWarning ? (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">
                  Aging
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-50">{card.count}</p>
            <p className="mt-1 text-xs text-zinc-500">
              7-day trend:{" "}
              <span className={card.trend7d > 0 ? "text-teal-300" : "text-zinc-400"}>
                {card.trend7d > 0 ? `+${card.trend7d}` : card.trend7d}
              </span>
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
