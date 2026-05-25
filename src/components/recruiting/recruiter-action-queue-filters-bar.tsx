"use client";

import {
  RECRUITER_QUICK_FILTERS,
  toggleRecruiterQuickFilter,
  type RecruiterQuickFilterId,
} from "@/lib/recruiter-action-queue-filters";

type RecruiterActionQueueFiltersBarProps = {
  activeFilter: RecruiterQuickFilterId;
  onFilterChange: (filter: RecruiterQuickFilterId) => void;
  counts: Partial<Record<RecruiterQuickFilterId, number>>;
  className?: string;
};

export function RecruiterActionQueueFiltersBar({
  activeFilter,
  onFilterChange,
  counts,
  className = "",
}: RecruiterActionQueueFiltersBarProps) {
  return (
    <div className={["flex flex-wrap gap-2", className].filter(Boolean).join(" ")}>
      {RECRUITER_QUICK_FILTERS.map(({ id, label }) => {
        const active = activeFilter === id;
        const count = counts[id];
        return (
          <button
            key={id}
            type="button"
            onClick={() => onFilterChange(toggleRecruiterQuickFilter(activeFilter, id))}
            className={[
              "rounded-full border px-3 py-1 text-xs font-medium",
              active
                ? "border-teal-500/40 bg-teal-500/15 text-teal-100"
                : "border-zinc-700 bg-zinc-950/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500/40",
            ].join(" ")}
          >
            {label}
            {typeof count === "number" && id !== "all" ? (
              <span className="ml-1 tabular-nums text-zinc-500">({count})</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
