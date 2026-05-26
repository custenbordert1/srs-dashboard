"use client";

import { useMemo, useState } from "react";
import {
  buildStaffingHeatRows,
  buildStaffingHeatRowsFromSnapshot,
  HEAT_LEVEL_STYLES,
  type StaffingHeatRow,
} from "@/lib/recruiting-dashboard-ux/staffing-heat-table";
import type { BreezyCandidate, BreezyJob } from "@/lib/breezy-api";
import type { RecruiterEscalationQueueItem } from "@/lib/operational-escalation/operational-escalation-types";
import type { RecruitingIntelligenceSnapshot } from "@/lib/recruiting-automation/build-recruiting-intelligence";

type StaffingRiskHeatPanelProps = {
  snapshot: RecruitingIntelligenceSnapshot;
  jobs?: BreezyJob[];
  candidates?: BreezyCandidate[];
  escalations?: RecruiterEscalationQueueItem[];
  activeRepsByState?: Map<string, number>;
};

type HeatView = "state" | "metro" | "city";

export function StaffingRiskHeatPanel({
  snapshot,
  jobs = [],
  candidates = [],
  escalations = [],
  activeRepsByState = new Map(),
}: StaffingRiskHeatPanelProps) {
  const [view, setView] = useState<HeatView>("state");

  const rows = useMemo(() => {
    const base =
      jobs.length > 0
        ? buildStaffingHeatRows({
            jobs,
            candidates,
            escalations,
            snapshot,
            activeRepsByState,
          })
        : buildStaffingHeatRowsFromSnapshot(snapshot, escalations);
    return base.filter((row) => row.scope === view);
  }, [jobs, candidates, escalations, snapshot, activeRepsByState, view]);

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-zinc-50">Staffing risk heatmap</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Ranked risk tables from open jobs, applicant flow, rep density, and escalation pressure.
          </p>
        </div>
        <div className="flex gap-1">
          {(["state", "metro", "city"] as const).map((scope) => (
            <button
              key={scope}
              type="button"
              onClick={() => setView(scope)}
              className={[
                "rounded-full border px-2.5 py-1 text-[11px] capitalize",
                view === scope
                  ? "border-teal-500/40 bg-teal-500/15 text-teal-100"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-600",
              ].join(" ")}
            >
              {scope}
            </button>
          ))}
        </div>
      </div>
      <HeatLegend />
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No staffing rows for this view.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] uppercase text-zinc-500">
                <th className="pb-2 pr-2">Market</th>
                <th className="pb-2 pr-2">Risk</th>
                <th className="pb-2 pr-2">Open jobs</th>
                <th className="pb-2 pr-2">Zero appl.</th>
                <th className="pb-2 pr-2">Reps</th>
                <th className="pb-2 pr-2">Escalations</th>
                <th className="pb-2 pr-2">Appl 7d</th>
                <th className="pb-2">Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((row) => (
                <HeatRow key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function HeatRow({ row }: { row: StaffingHeatRow }) {
  return (
    <tr className={`border-b border-zinc-800/60 ${HEAT_LEVEL_STYLES[row.level]}`}>
      <td className="py-2 pr-2 font-medium">{row.label}</td>
      <td className="py-2 pr-2 capitalize">{row.level}</td>
      <td className="py-2 pr-2 tabular-nums">{row.openJobs}</td>
      <td className="py-2 pr-2 tabular-nums">{row.zeroApplicantJobs}</td>
      <td className="py-2 pr-2 tabular-nums">{row.activeReps}</td>
      <td className="py-2 pr-2 tabular-nums">{row.escalationCount}</td>
      <td className="py-2 pr-2 tabular-nums">{row.applicants7d}</td>
      <td className="py-2 tabular-nums">{row.healthScore}</td>
    </tr>
  );
}

function HeatLegend() {
  return (
    <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wide">
      <span className={`rounded-full border px-2 py-0.5 ${HEAT_LEVEL_STYLES.healthy}`}>Green · healthy</span>
      <span className={`rounded-full border px-2 py-0.5 ${HEAT_LEVEL_STYLES.moderate}`}>
        Yellow · moderate
      </span>
      <span className={`rounded-full border px-2 py-0.5 ${HEAT_LEVEL_STYLES.critical}`}>Red · critical</span>
    </div>
  );
}
