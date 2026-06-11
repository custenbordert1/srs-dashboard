"use client";

import { useDmEscalationQueue } from "@/hooks/use-dm-escalation-queue";
import type { UserPublic } from "@/lib/auth/types";
import type { DmJobOperationalDetail } from "@/lib/dm-dashboard/dm-operational-types";
import { DM_ESCALATION_ACTION_LABELS, type DmEscalationActionType } from "@/lib/dm-dashboard/dm-operational-types";
import {
  coverageTierLabel,
  coverageTierStyles,
  type DmPortalTerritorySummary,
} from "@/lib/dm-portal/dm-portal-operational";
import { submitDmEscalation } from "@/lib/dm-portal/submit-dm-escalation";
import { OPERATIONAL_ESCALATION_LABELS } from "@/lib/operational-escalation/operational-escalation-types";
import { useCallback, useMemo, useState } from "react";

const PRIMARY_ACTIONS: DmEscalationActionType[] = [
  "request-new-ad",
  "request-recruiter-assignment",
  "coverage-concern",
];

type DmActionCenterProps = {
  territory: DmPortalTerritorySummary;
  jobs: DmJobOperationalDetail[];
  user: UserPublic;
  onOpenJob: (jobId: string) => void;
  onToast: (message: string, tone?: "success" | "info") => void;
  onEscalationSubmitted?: () => void;
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case "completed":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
    case "in_review":
      return "border-amber-500/40 bg-amber-500/10 text-amber-100";
    case "dismissed":
      return "border-zinc-600/40 bg-zinc-800/40 text-zinc-400";
    default:
      return "border-violet-500/40 bg-violet-500/10 text-violet-100";
  }
}

export function DmActionCenter({
  territory,
  jobs,
  user,
  onOpenJob,
  onToast,
  onEscalationSubmitted,
}: DmActionCenterProps) {
  const tierStyles = coverageTierStyles(territory.coverageTier);
  const { items, statusLabels, loading, error, refreshedAt, refresh } = useDmEscalationQueue();
  const [selectedJobId, setSelectedJobId] = useState(() => jobs[0]?.jobId ?? "");
  const [submitting, setSubmitting] = useState<DmEscalationActionType | null>(null);

  const selectedJob = useMemo(
    () => jobs.find((row) => row.jobId === selectedJobId) ?? jobs[0] ?? null,
    [jobs, selectedJobId],
  );

  const openRequests = useMemo(
    () => items.filter((row) => row.status === "new" || row.status === "in_review").length,
    [items],
  );

  const runAction = useCallback(
    async (actionType: DmEscalationActionType) => {
      if (!selectedJob) {
        onToast("Select a job before submitting a request.", "info");
        return;
      }
      setSubmitting(actionType);
      const result = await submitDmEscalation({
        actionType,
        job: selectedJob,
        user,
      });
      setSubmitting(null);
      if (!result.ok) {
        onToast(result.error, "info");
        return;
      }
      onToast(`${DM_ESCALATION_ACTION_LABELS[actionType]} sent for ${selectedJob.title}`);
      onEscalationSubmitted?.();
      void refresh();
    },
    [onEscalationSubmitted, onToast, refresh, selectedJob, user],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className={`rounded-xl border px-4 py-4 ${tierStyles.border} ${tierStyles.bg}`}>
          <h3 className={`text-sm font-semibold ${tierStyles.text}`}>Coverage status</h3>
          <p className="mt-1 text-xs text-zinc-500">Territory staffing and demand composite</p>
          <div className="mt-3 flex items-baseline justify-between gap-2">
            <p className={`text-3xl font-semibold tabular-nums ${tierStyles.text}`}>
              {territory.coveragePercent}%
            </p>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tierStyles.text} ${tierStyles.border}`}
            >
              {coverageTierLabel(territory.coverageTier)}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-950/80">
            <div
              className={`h-full rounded-full ${tierStyles.meter}`}
              style={{ width: `${Math.min(100, Math.max(0, territory.coveragePercent))}%` }}
            />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2">
              <dt className="text-zinc-500">Open calls</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-100">
                {territory.openCalls.toLocaleString()}
              </dd>
            </div>
            <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2">
              <dt className="text-zinc-500">Active reps</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-zinc-100">
                {territory.activeReps.toLocaleString()}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 px-4 py-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-violet-100">Submit requests</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Request ads, recruiter support, or flag coverage — routed to the recruiter action queue.
          </p>
          {jobs.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">No open jobs in territory snapshot.</p>
          ) : (
            <>
              <label className="mt-4 block text-xs font-medium text-zinc-400">
                Job
                <select
                  value={selectedJob?.jobId ?? ""}
                  onChange={(event) => setSelectedJobId(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                >
                  {jobs.map((job) => (
                    <option key={job.jobId} value={job.jobId}>
                      {job.title} · {job.city}, {job.state}
                      {job.assignedRecruiter ? ` · ${job.assignedRecruiter}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {selectedJob ? (
                <p className="mt-2 text-xs text-zinc-500">
                  {selectedJob.applicantCount} applicants ·{" "}
                  {selectedJob.assignedRecruiter
                    ? `Recruiter: ${selectedJob.assignedRecruiter}`
                    : "No recruiter assigned"}
                  {" · "}
                  <button
                    type="button"
                    onClick={() => onOpenJob(selectedJob.jobId)}
                    className="text-teal-400 hover:text-teal-300"
                  >
                    Open job detail
                  </button>
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {PRIMARY_ACTIONS.map((action) => (
                  <button
                    key={action}
                    type="button"
                    disabled={!selectedJob || submitting !== null}
                    onClick={() => void runAction(action)}
                    className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-100 hover:bg-violet-500/20 disabled:opacity-40"
                  >
                    {submitting === action ? "Sending…" : DM_ESCALATION_ACTION_LABELS[action]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Request tracking</h3>
            <p className="mt-1 text-xs text-zinc-500">
              {openRequests > 0
                ? `${openRequests} open request${openRequests === 1 ? "" : "s"} with recruiting`
                : "No open requests — submit above or from job detail."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800/60 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-amber-200/90">{error}</p> : null}
        {items.length === 0 && !loading ? (
          <p className="mt-3 text-sm text-zinc-500">No escalation requests yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800/80">
            {items.slice(0, 12).map((row) => (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100">
                    {OPERATIONAL_ESCALATION_LABELS[row.escalationType]}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {row.jobTitle} · {row.city}, {row.state}
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-600">
                    Submitted {new Date(row.createdAt).toLocaleString()}
                    {row.updatedAt !== row.createdAt
                      ? ` · Updated ${new Date(row.updatedAt).toLocaleString()}`
                      : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadgeClass(row.status)}`}
                >
                  {statusLabels?.[row.status] ?? row.status.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
        {refreshedAt ? (
          <p className="mt-2 text-[10px] text-zinc-600">
            Queue synced {new Date(refreshedAt).toLocaleTimeString()}
          </p>
        ) : null}
      </div>
    </div>
  );
}
