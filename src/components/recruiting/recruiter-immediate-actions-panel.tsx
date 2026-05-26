"use client";

import { useMemo, useState } from "react";
import type { RecruiterActionItem } from "@/lib/recruiting-dashboard-ux/recruiter-action-catalog";
import { groupRecruiterActions } from "@/lib/recruiting-dashboard-ux/recruiter-action-catalog";
import {
  SEVERITY_BADGE_STYLES,
  SEVERITY_CARD_STYLES,
  SEVERITY_LABELS,
} from "@/lib/recruiting-dashboard-ux/severity-styles";

const DEFAULT_VISIBLE = 5;

type RecruiterImmediateActionsPanelProps = {
  actions: RecruiterActionItem[];
};

export function RecruiterImmediateActionsPanel({ actions }: RecruiterImmediateActionsPanelProps) {
  const [showAll, setShowAll] = useState(false);
  const [dense, setDense] = useState(false);

  const groups = useMemo(() => groupRecruiterActions(actions), [actions]);
  const visibleGroups = showAll ? groups : groups.slice(0, DEFAULT_VISIBLE);

  return (
    <section className="rounded-2xl border border-red-500/25 bg-gradient-to-br from-red-500/8 to-zinc-950/50 p-4 sm:p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-red-300/90">
            Immediate actions
          </p>
          <h3 className="mt-1 text-base font-semibold text-zinc-50">What needs attention now</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Top urgent tasks, staffing risk, and aging jobs — manual review only.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDense((value) => !value)}
            className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800"
          >
            {dense ? "Comfortable" : "Compact"}
          </button>
          {groups.length > DEFAULT_VISIBLE ? (
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
            >
              {showAll ? "Show top 5" : `View all (${groups.length})`}
            </button>
          ) : null}
        </div>
      </header>

      {visibleGroups.length === 0 ? (
        <p className="text-sm text-zinc-500">No immediate actions for this territory.</p>
      ) : (
        <ul className={dense ? "space-y-1.5" : "space-y-2"}>
          {visibleGroups.map((group) => {
            const lead = group.items[0]!;
            return (
              <li
                key={group.groupKey}
                className={`rounded-xl border px-3 ${dense ? "py-1.5" : "py-2"} text-sm ${SEVERITY_CARD_STYLES[group.topSeverity]}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_BADGE_STYLES[group.topSeverity]}`}
                  >
                    {SEVERITY_LABELS[group.topSeverity]}
                  </span>
                  <span className="text-[10px] tabular-nums text-zinc-500">
                    Urgency {lead.urgencyScore}
                  </span>
                  {lead.agingDays != null ? (
                    <span className="text-[10px] text-amber-300/90">{lead.agingDays}d aging</span>
                  ) : null}
                  {lead.staffingImpact > 0 ? (
                    <span className="text-[10px] text-zinc-500">
                      Staffing impact {lead.staffingImpact}
                    </span>
                  ) : null}
                  {group.items.length > 1 ? (
                    <span className="text-[10px] text-zinc-500">+{group.items.length - 1} related</span>
                  ) : null}
                </div>
                <p className={`font-medium text-zinc-100 ${dense ? "mt-0.5 text-xs" : "mt-1"}`}>
                  {lead.title}
                </p>
                {!dense ? (
                  <>
                    <p className="mt-0.5 text-xs text-zinc-400">{lead.reason}</p>
                    <p className="mt-1 text-[10px] text-teal-400/80">
                      Expected: {lead.expectedOutcome}
                    </p>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
