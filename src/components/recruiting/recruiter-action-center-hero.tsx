"use client";

import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { buildQueueCompactMetrics } from "@/lib/candidate-queue-metrics";
import {
  buildRecruiterActionQueueCounts,
  type RecruiterInboxSectionId,
} from "@/lib/recruiter-action-queue-filters";
import type { RecruiterRosters } from "@/lib/candidate-workflow-types";

type RecruiterActionCenterHeroProps = {
  candidates: ScoredCandidateWorkflowRow[];
  actingRecruiter: string;
  rosters: RecruiterRosters;
  onActingRecruiterChange: (name: string) => void;
  onScrollToSection: (section: RecruiterInboxSectionId) => void;
};

const QUICK_ACTIONS: Array<{ section: RecruiterInboxSectionId; label: string }> = [
  { section: "overdue-follow-ups", label: "Overdue follow-ups" },
  { section: "paperwork-pending", label: "Paperwork queue" },
  { section: "interview-needed", label: "Interview needed" },
  { section: "ready-for-mel", label: "Ready for MEL" },
];

function MustDoMetric({ label, value, tone }: { label: string; value: number; tone?: "warn" | "ok" }) {
  const toneClass =
    tone === "warn"
      ? "border-amber-500/35 bg-amber-500/8"
      : tone === "ok"
        ? "border-teal-500/35 bg-teal-500/8"
        : "border-zinc-800/80 bg-zinc-950/50";
  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-zinc-50">{value}</p>
    </div>
  );
}

export function RecruiterActionCenterHero({
  candidates,
  actingRecruiter,
  rosters,
  onActingRecruiterChange,
  onScrollToSection,
}: RecruiterActionCenterHeroProps) {
  const metrics = buildQueueCompactMetrics(candidates);
  const actionCounts = buildRecruiterActionQueueCounts(candidates);

  return (
    <section className="rounded-2xl border border-teal-500/25 bg-gradient-to-br from-teal-500/10 via-zinc-900/60 to-zinc-900/40 p-5 shadow-lg shadow-black/20 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-teal-300/90">
            Recruiter Inbox
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">Candidates</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Daily workflow for <span className="text-zinc-200">{actingRecruiter}</span>
          </p>
        </div>
        <label className="flex min-w-[12rem] flex-col gap-1 text-xs text-zinc-400">
          Acting recruiter
          <select
            value={actingRecruiter}
            onChange={(event) => onActingRecruiterChange(event.target.value)}
            className="rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100"
          >
            {rosters.recruiters.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-zinc-200">Must do today</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MustDoMetric label="Overdue follow-ups" value={metrics.overdueFollowUps} tone="warn" />
          <MustDoMetric label="Paperwork pending" value={metrics.paperworkPending} />
          <MustDoMetric label="Interview needed" value={actionCounts.interviewNeeded} tone="warn" />
          <MustDoMetric label="Ready for MEL" value={metrics.readyForMel} tone="ok" />
        </div>
        {actionCounts.needsReview > 0 ? (
          <p className="mt-3 text-xs text-amber-200/90">
            {actionCounts.needsReview} candidate{actionCounts.needsReview === 1 ? "" : "s"} still need
            first review — check Newly applied below.
          </p>
        ) : null}
      </div>

      <div className="mt-6">
        <h2 className="text-sm font-semibold text-zinc-200">Jump to queue</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.section}
              type="button"
              onClick={() => onScrollToSection(action.section)}
              className="rounded-lg border border-teal-500/40 bg-teal-500/15 px-4 py-2 text-sm font-medium text-teal-100 transition-colors hover:bg-teal-500/25"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
