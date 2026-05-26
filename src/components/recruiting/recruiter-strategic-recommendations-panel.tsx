"use client";

import { useMemo, useState } from "react";
import type { RecruiterActionItem } from "@/lib/recruiting-dashboard-ux/recruiter-action-catalog";
import { groupRecruiterActions } from "@/lib/recruiting-dashboard-ux/recruiter-action-catalog";
import {
  SEVERITY_BADGE_STYLES,
  SEVERITY_CARD_STYLES,
  SEVERITY_LABELS,
} from "@/lib/recruiting-dashboard-ux/severity-styles";

type RecruiterStrategicRecommendationsPanelProps = {
  actions: RecruiterActionItem[];
};

export function RecruiterStrategicRecommendationsPanel({
  actions,
}: RecruiterStrategicRecommendationsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const groups = useMemo(() => groupRecruiterActions(actions), [actions]);
  const visible = expanded ? groups : groups.slice(0, 6);

  if (groups.length === 0) return null;

  return (
    <section className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 sm:p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-300/90">
            Strategic recommendations
          </p>
          <h3 className="mt-1 text-base font-semibold text-zinc-50">Coverage & territory improvements</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Metro expansion, pay/radius, and long-term territory moves — plan manually.
          </p>
        </div>
        {groups.length > 6 ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
          >
            {expanded ? "Show fewer" : `View all (${groups.length})`}
          </button>
        ) : null}
      </header>
      <ul className="space-y-2">
        {visible.map((group) => {
          const lead = group.items[0]!;
          return (
            <li
              key={group.groupKey}
              className={`rounded-lg border px-3 py-2 text-sm ${SEVERITY_CARD_STYLES[lead.severity]}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${SEVERITY_BADGE_STYLES[lead.severity]}`}
                >
                  {SEVERITY_LABELS[lead.severity]}
                </span>
                <span className="text-[10px] text-zinc-500">{lead.actionType.replace(/-/g, " ")}</span>
              </div>
              <p className="mt-1 font-medium text-zinc-100">{lead.title}</p>
              <p className="mt-0.5 text-xs text-zinc-400">{lead.reason}</p>
              <p className="mt-1 text-[10px] text-sky-300/80">Outcome: {lead.expectedOutcome}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
