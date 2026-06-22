"use client";

import {
  CANDIDATE_QUEUE_TABS,
  type RecruiterQuickFilterId,
} from "@/lib/recruiter-action-queue-filters";

type CandidateQueueTabsProps = {
  activeFilter: RecruiterQuickFilterId;
  counts: Record<RecruiterQuickFilterId, number>;
  onFilterChange: (filter: RecruiterQuickFilterId) => void;
};

export function CandidateQueueTabs({ activeFilter, counts, onFilterChange }: CandidateQueueTabsProps) {
  return (
    <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 px-4 py-3 shadow-sm shadow-black/20 sm:px-5">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Candidate queues">
        {CANDIDATE_QUEUE_TABS.map(({ id, label }) => {
          const active = activeFilter === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onFilterChange(id)}
              className={[
                "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-teal-500/45 bg-teal-500/15 text-teal-100"
                  : "border-zinc-700/80 bg-zinc-950/40 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200",
              ].join(" ")}
            >
              {label}
              <span className="ml-1.5 tabular-nums text-zinc-500">({counts[id] ?? 0})</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
