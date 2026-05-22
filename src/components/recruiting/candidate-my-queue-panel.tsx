"use client";

import { CandidateQueueRow } from "@/components/recruiting/candidate-queue-row";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildCandidateQueueBoard,
  CANDIDATE_QUEUE_LANE_LABELS,
  CANDIDATE_QUEUE_LANE_ORDER,
  type CandidateQueueLaneId,
} from "@/lib/candidate-action-queue";
import { buildQueueCompactMetrics } from "@/lib/candidate-queue-metrics";
import type { CandidateQueueActionPayload } from "@/lib/candidate-queue-actions";
import type { RecruiterRosters } from "@/lib/candidate-workflow-types";
import { pickActingRecruiter } from "@/lib/recruiter-roster";
import { useMemo, useState } from "react";

type CandidateMyQueuePanelProps = {
  candidates: ScoredCandidateWorkflowRow[];
  rosters: RecruiterRosters;
  actingRecruiter: string;
  onActingRecruiterChange: (name: string) => void;
  onOpenCandidate: (candidateId: string) => void;
  onQueueAction: (candidateId: string, payload: CandidateQueueActionPayload) => void;
  queueActionBusy?: boolean;
  syncPartial?: boolean;
  syncStale?: boolean;
};

export function CandidateMyQueuePanel({
  candidates,
  rosters,
  actingRecruiter,
  onActingRecruiterChange,
  onOpenCandidate,
  onQueueAction,
  queueActionBusy = false,
  syncPartial,
  syncStale,
}: CandidateMyQueuePanelProps) {
  const [activeLane, setActiveLane] = useState<CandidateQueueLaneId>("my-open");

  const board = useMemo(
    () => buildCandidateQueueBoard(candidates, actingRecruiter, { limitPerLane: 40 }),
    [actingRecruiter, candidates],
  );

  const metrics = useMemo(() => buildQueueCompactMetrics(candidates), [candidates]);

  const activeQueue = board.lanes[activeLane];
  const myOpenCount = board.lanes["my-open"].totalInLane;

  return (
    <section
      aria-labelledby="my-queue-heading"
      className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="my-queue-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
            My queue
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Operational tasks for <span className="text-zinc-300">{actingRecruiter}</span>. My open shows
            only candidates assigned to the acting recruiter (snoozed hidden). Unassigned stays separate.
          </p>
          {syncPartial ? (
            <p className="mt-2 text-xs text-amber-200/90">Partial Breezy hydration — queue counts may grow after full sync.</p>
          ) : null}
          {syncStale ? (
            <p className="mt-2 text-xs text-amber-200/90">Showing last successful Breezy snapshot.</p>
          ) : null}
        </div>
        <label className="flex min-w-[12rem] flex-col gap-1 text-xs text-zinc-400">
          Acting recruiter
          <select
            value={actingRecruiter}
            onChange={(e) => onActingRecruiterChange(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-950/80 px-2 py-1.5 text-sm text-zinc-100"
          >
            {rosters.recruiters.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Overdue follow-ups" value={metrics.overdueFollowUps} tone="warn" />
        <MetricCard label="Paperwork pending" value={metrics.paperworkPending} />
        <MetricCard label="Ready for MEL" value={metrics.readyForMel} tone="ok" />
        <MetricCard label="Unassigned" value={metrics.unassigned} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {CANDIDATE_QUEUE_LANE_ORDER.map((lane) => {
          const count = board.lanes[lane].totalInLane;
          const active = activeLane === lane;
          return (
            <button
              key={lane}
              type="button"
              onClick={() => setActiveLane(lane)}
              className={[
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active
                  ? "border-teal-500/40 bg-teal-500/15 text-teal-100"
                  : "border-zinc-700 bg-zinc-950/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200",
              ].join(" ")}
            >
              {CANDIDATE_QUEUE_LANE_LABELS[lane]} ({count})
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-zinc-800/80 bg-zinc-950/40">
        <div className="border-b border-zinc-800/80 px-3 py-2 sm:px-4">
          <p className="text-sm font-medium text-zinc-200">
            {CANDIDATE_QUEUE_LANE_LABELS[activeLane]}
            <span className="ml-2 text-zinc-500">
              {activeQueue.totalInLane} candidate{activeQueue.totalInLane === 1 ? "" : "s"}
            </span>
          </p>
          {activeLane === "my-open" && myOpenCount === 0 ? (
            <p className="mt-1 text-xs text-zinc-500">
              No open items for {actingRecruiter}. Assign yourself from a row below or check Unassigned.
            </p>
          ) : null}
        </div>
        {activeQueue.rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">No candidates in this lane.</p>
        ) : (
          <ul className="divide-y divide-zinc-800/60">
            {activeQueue.rows.map((row) => (
              <CandidateQueueRow
                key={row.candidateId}
                row={row}
                rosters={rosters}
                actingRecruiter={actingRecruiter}
                busy={queueActionBusy}
                onOpen={() => onOpenCandidate(row.candidateId)}
                onAction={(payload) => onQueueAction(row.candidateId, payload)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warn" | "ok";
}) {
  const toneClass =
    tone === "warn"
      ? "border-amber-500/30 bg-amber-500/5"
      : tone === "ok"
        ? "border-teal-500/30 bg-teal-500/5"
        : "border-zinc-800/80 bg-zinc-950/40";
  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-50">{value.toLocaleString()}</p>
    </div>
  );
}

export function initialActingRecruiter(rosters: RecruiterRosters): string {
  return pickActingRecruiter(rosters);
}
