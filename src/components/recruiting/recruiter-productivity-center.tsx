"use client";

import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildQueueCompactMetrics } from "@/lib/candidate-queue-metrics";
import Link from "next/link";
import {
  buildRecruiterActionQueueCounts,
  type RecruiterQuickFilterId,
} from "@/lib/recruiter-action-queue-filters";
import { PIPELINE_QUEUE_LINKS } from "@/lib/pipeline-intelligence/client";

type RecruiterProductivityCenterProps = {
  candidates: ScoredCandidateWorkflowRow[];
  actingRecruiter: string;
  quickFilter: RecruiterQuickFilterId;
  onQuickFilterChange: (filter: RecruiterQuickFilterId) => void;
};

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-50">{value}</p>
    </div>
  );
}

export function RecruiterProductivityCenter({
  candidates,
  actingRecruiter,
  quickFilter,
  onQuickFilterChange,
}: RecruiterProductivityCenterProps) {
  const queueMetrics = buildQueueCompactMetrics(candidates);
  const actionCounts = buildRecruiterActionQueueCounts(candidates);
  const queueCountByFilter: Record<RecruiterQuickFilterId, number> = {
    all: candidates.length,
    "my-owned": 0,
    "needs-review": actionCounts.needsReview,
    "needs-follow-up": actionCounts.needsFollowUp,
    "no-response": actionCounts.noResponse,
    overdue: 0,
    unassigned: 0,
    "paperwork-pending": actionCounts.paperworkPending,
    "interview-needed": actionCounts.interviewNeeded,
    "ready-mel": actionCounts.readyForMel,
    priority: actionCounts.priority,
  };
  const touchesToday = candidates.filter((row) => {
    if (!row.lastActionAt) return false;
    const touched = new Date(row.lastActionAt);
    const now = new Date();
    return (
      touched.getFullYear() === now.getFullYear() &&
      touched.getMonth() === now.getMonth() &&
      touched.getDate() === now.getDate()
    );
  }).length;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-semibold text-zinc-50">Recruiter Action Center</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Action-driven workflow for <span className="text-zinc-300">{actingRecruiter}</span> — review queue,
          follow-ups, paperwork, and MEL readiness.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Touches today" value={touchesToday} />
        <Metric label="Follow-ups overdue" value={queueMetrics.overdueFollowUps} />
        <Metric label="Paperwork pending" value={queueMetrics.paperworkPending} />
        <Metric label="Ready for MEL" value={queueMetrics.readyForMel} />
        <Metric label="Interviews needed" value={actionCounts.interviewNeeded} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {PIPELINE_QUEUE_LINKS.map((link) => (
          <Link
            key={link.id}
            href={link.href}
            onClick={(event) => {
              event.preventDefault();
              onQuickFilterChange(link.filter);
            }}
            className={[
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              quickFilter === link.filter
                ? "border-teal-500/50 bg-teal-500/15 text-teal-100"
                : "border-zinc-700 text-zinc-400 hover:bg-zinc-800",
            ].join(" ")}
          >
            {link.label}
            <span className="ml-1.5 tabular-nums text-zinc-500">
              {queueCountByFilter[link.filter]}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
