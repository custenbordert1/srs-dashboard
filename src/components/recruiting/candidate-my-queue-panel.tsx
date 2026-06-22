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
import { buildPaperworkOperationsMetrics } from "@/lib/paperwork-operations-metrics";
import type { CandidateQueueActionPayload } from "@/lib/candidate-queue-actions";
import type { RecruiterRosters } from "@/lib/candidate-workflow-types";
import {
  buildRecruiterActionQueueCounts,
  matchesRecruiterQuickFilter,
  type RecruiterQuickFilterId,
} from "@/lib/recruiter-action-queue-filters";
import { RecruiterActionQueueFiltersBar } from "@/components/recruiting/recruiter-action-queue-filters-bar";
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
  quickFilter: RecruiterQuickFilterId;
  onQuickFilterChange: (filter: RecruiterQuickFilterId) => void;
  /** When false, only lane board renders (metrics/filters live on main Candidates tab). */
  showMetrics?: boolean;
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
  quickFilter,
  onQuickFilterChange,
  showMetrics = true,
}: CandidateMyQueuePanelProps) {
  const [activeLane, setActiveLane] = useState<CandidateQueueLaneId>("my-open");

  const queueCandidates = useMemo(() => {
    if (quickFilter === "all") return candidates;
    return candidates.filter((row) => matchesRecruiterQuickFilter(row, quickFilter, actingRecruiter));
  }, [actingRecruiter, candidates, quickFilter]);

  const board = useMemo(
    () => buildCandidateQueueBoard(queueCandidates, actingRecruiter, { limitPerLane: 40 }),
    [actingRecruiter, queueCandidates],
  );

  const metrics = useMemo(() => buildQueueCompactMetrics(candidates), [candidates]);
  const paperworkOps = useMemo(() => buildPaperworkOperationsMetrics(candidates), [candidates]);
  const actionCounts = useMemo(() => buildRecruiterActionQueueCounts(candidates), [candidates]);

  const filterCounts = useMemo(
    () => ({
      "my-owned": candidates.filter((r) =>
        matchesRecruiterQuickFilter(r, "my-owned", actingRecruiter),
      ).length,
      "needs-follow-up": actionCounts.needsFollowUp,
      "no-response": actionCounts.noResponse,
      "paperwork-pending": actionCounts.paperworkPending,
      "interview-needed": actionCounts.interviewNeeded,
      "ready-mel": actionCounts.readyForMel,
      priority: actionCounts.priority,
    }),
    [actingRecruiter, actionCounts, candidates],
  );

  const activeQueue = board.lanes[activeLane];
  const myOpenCount = board.lanes["my-open"].totalInLane;

  return (
    <section
      aria-labelledby="my-queue-heading"
      className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="my-queue-heading" className="text-lg font-semibold tracking-tight text-zinc-50">
            Recruiter action queue
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Follow-ups, aging, and ownership for{" "}
            <span className="text-zinc-300">{actingRecruiter}</span>. Uses local workflow overlay only — Breezy
            sync stays read-only. Notes and due dates persist in{" "}
            <span className="text-zinc-400">/api/candidates/workflows</span>.
          </p>
          <div className="mt-2 min-h-[1.125rem] text-xs leading-snug text-amber-200/90">
            {syncPartial ? (
              <p className="line-clamp-2">Partial Breezy hydration — queue counts may grow after full sync.</p>
            ) : null}
            {syncStale ? (
              <p className="line-clamp-2">Showing last successful Breezy snapshot.</p>
            ) : null}
          </div>
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

      {showMetrics ? (
        <RecruiterActionQueueFiltersBar
          className="mt-4"
          activeFilter={quickFilter}
          onFilterChange={onQuickFilterChange}
          counts={filterCounts}
        />
      ) : null}

      {showMetrics ? (
        <>
      <div className="mt-4 grid auto-rows-fr items-stretch gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Overdue follow-ups" value={metrics.overdueFollowUps} tone="warn" />
        <MetricCard label="Paperwork pending" value={metrics.paperworkPending} />
        <MetricCard label="Ready for MEL" value={metrics.readyForMel} tone="ok" />
        <MetricCard label="Unassigned" value={metrics.unassigned} />
      </div>

      <div className="mt-2 grid auto-rows-fr items-stretch gap-2 sm:grid-cols-3">
        <MetricCard label="Aging 24h+" value={actionCounts.aging24h} tone="warn" />
        <MetricCard label="Aging 3d+" value={actionCounts.aging3d} tone="warn" />
        <MetricCard label="Aging 7d+" value={actionCounts.aging7dPlus} tone="warn" />
      </div>

      <div className="mt-2 grid auto-rows-fr items-stretch gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Viewed, not signed" value={paperworkOps.viewedNotSigned} />
        <MetricCard
          label="Avg time to sign (h)"
          value={paperworkOps.avgTimeToSignHours != null ? String(paperworkOps.avgTimeToSignHours) : "—"}
        />
        <MetricCard label="Signed today" value={paperworkOps.signedToday} tone="ok" />
        <MetricCard label="Pending 24h+" value={paperworkOps.pendingOver24h} tone="warn" />
        <MetricCard label="Resend watchlist" value={paperworkOps.resendCandidates} tone="warn" />
      </div>
        </>
      ) : null}

      <div className={`${showMetrics ? "mt-4" : "mt-2"} flex flex-wrap gap-2`}>
        {CANDIDATE_QUEUE_LANE_ORDER.map((lane) => {
          const count = board.lanes[lane].totalInLane;
          const active = activeLane === lane;
          return (
            <button
              key={lane}
              type="button"
              onClick={() => setActiveLane(lane)}
              className={[
                "rounded-full border px-3 py-1 text-xs font-medium",
                active
                  ? "border-teal-500/40 bg-teal-500/15 text-teal-100"
                  : "border-zinc-700 bg-zinc-950/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-500/40",
              ].join(" ")}
            >
              {CANDIDATE_QUEUE_LANE_LABELS[lane]} ({count})
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-xl border border-zinc-800/60 bg-zinc-950/40">
        <div className="border-b border-zinc-800/60 px-3 py-2 sm:px-4">
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
          <ul
            className="max-h-[min(60vh,560px)] divide-y divide-zinc-800/35 overflow-y-auto overscroll-contain"
            aria-label={`${CANDIDATE_QUEUE_LANE_LABELS[activeLane]} queue`}
          >
            <li
              className="sticky top-0 z-10 hidden border-b border-zinc-800/50 bg-zinc-950/95 px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-600 backdrop-blur-sm sm:grid sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_4.75rem_minmax(0,auto)] sm:gap-x-3"
              aria-hidden
            >
              <span>Candidate</span>
              <span>Next action</span>
              <span className="text-right">Urgency</span>
              <span className="text-right">Actions</span>
            </li>
            {activeQueue.rows.map((row, rowIndex) => (
              <CandidateQueueRow
                key={row.candidateId}
                row={row}
                rowIndex={rowIndex}
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
  value: number | string;
  tone?: "neutral" | "warn" | "ok";
}) {
  const toneClass =
    tone === "warn"
      ? "border-amber-500/30 bg-amber-500/5"
      : tone === "ok"
        ? "border-teal-500/30 bg-teal-500/5"
        : "border-zinc-800/80 bg-zinc-950/40";
  return (
    <div className={`flex min-h-[4.25rem] flex-col justify-center rounded-lg border px-3 py-2 ${toneClass}`}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold leading-none tabular-nums text-zinc-50">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

export function initialActingRecruiter(rosters: RecruiterRosters): string {
  return pickActingRecruiter(rosters);
}
