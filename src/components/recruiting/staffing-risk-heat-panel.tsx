"use client";

import { useMemo, useState } from "react";
import {
  buildStaffingHeatRows,
  buildStaffingHeatRowsFromSnapshot,
  HEAT_LEVEL_STYLES,
  type StaffingHeatRow,
  type StaffingHeatTrend,
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

const TREND_LABEL: Record<StaffingHeatTrend, string> = {
  improving: "Improving",
  declining: "Declining",
  stable: "Stable",
};

const TREND_ARROW: Record<StaffingHeatTrend, string> = {
  improving: "↓",
  declining: "↑",
  stable: "→",
};

export function StaffingRiskHeatPanel({
  snapshot,
  jobs = [],
  candidates = [],
  escalations = [],
  activeRepsByState = new Map(),
}: StaffingRiskHeatPanelProps) {
  const [view, setView] = useState<HeatView>("state");
  const territoryPressure =
    snapshot.decisionIntelligence?.territory.staffingPressureScore ?? 0;

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

  const maxScore = useMemo(
    () => Math.max(...rows.map((row) => row.healthScore), 1),
    [rows],
  );

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-zinc-50">Territory risk heatmap</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Ranked markets with staffing pressure {territoryPressure}/100, applicant deltas, and escalation signals.
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
        <div className="mt-3 space-y-2">
          {rows.slice(0, 12).map((row) => (
            <HeatBarRow key={row.id} row={row} maxScore={maxScore} />
          ))}
        </div>
      )}
    </section>
  );
}

function HeatBarRow({ row, maxScore }: { row: StaffingHeatRow; maxScore: number }) {
  const widthPct = Math.round((row.healthScore / maxScore) * 100);
  const trend = row.trend ?? "stable";

  return (
    <div
      className={`rounded-xl border px-3 py-2 ${HEAT_LEVEL_STYLES[row.level]} ${row.isHighestRisk ? "ring-1 ring-red-400/40" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold tabular-nums text-zinc-500">#{row.rank ?? "—"}</span>
          <span className="text-sm font-medium">{row.label}</span>
          <span className="rounded-full border border-zinc-700/80 px-1.5 py-0.5 text-[9px] uppercase">
            {row.scope}
          </span>
          {row.isHighestRisk ? (
            <span className="rounded-full border border-red-500/50 bg-red-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-red-200">
              Highest risk
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <span className="capitalize">{row.level}</span>
          <span title={TREND_LABEL[trend]}>
            {TREND_ARROW[trend]} {TREND_LABEL[trend]}
            {row.trendDelta != null && row.trendDelta !== 0 ? ` (${row.trendDelta > 0 ? "+" : ""}${row.trendDelta})` : ""}
          </span>
        </div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-900/80">
        <div
          className={`h-full rounded-full ${row.level === "critical" ? "bg-red-500/80" : row.level === "moderate" ? "bg-amber-500/70" : "bg-emerald-500/70"}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] tabular-nums text-zinc-400">
        <span>Score {row.healthScore}</span>
        <span>Pressure {row.staffingPressureScore ?? "—"}</span>
        <span>Open {row.openJobs}</span>
        <span>Zero appl. {row.zeroApplicantJobs}</span>
        <span>Reps {row.activeReps}</span>
        <span>Esc. {row.escalationCount}</span>
        <span>Appl 7d {row.applicants7d}</span>
      </div>
    </div>
  );
}

function HeatLegend() {
  return (
    <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wide">
      <span className={`rounded-full border px-2 py-0.5 ${HEAT_LEVEL_STYLES.healthy}`}>Green · healthy</span>
      <span className={`rounded-full border px-2 py-0.5 ${HEAT_LEVEL_STYLES.moderate}`}>
        Amber · moderate
      </span>
      <span className={`rounded-full border px-2 py-0.5 ${HEAT_LEVEL_STYLES.critical}`}>Red · critical</span>
    </div>
  );
}
