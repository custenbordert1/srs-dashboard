"use client";

import type { DmOperationalDrawerView } from "@/hooks/use-dm-operational-drawer";
import type { DmEscalationActionType, DmEscalationLogEntry } from "@/lib/dm-dashboard/dm-operational-types";
import { DM_ESCALATION_ACTION_LABELS } from "@/lib/dm-dashboard/dm-operational-types";

const ESCALATION_ACTIONS: DmEscalationActionType[] = [
  "escalate-recruiting",
  "request-repost",
  "request-pay-review",
  "expand-radius",
];

type DmOperationalDrawerProps = {
  open: boolean;
  view: DmOperationalDrawerView | null;
  escalationLogs: DmEscalationLogEntry[];
  onClose: () => void;
  onEscalation: (action: DmEscalationActionType) => void;
  onSelectJob?: (jobId: string) => void;
};

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right font-medium text-zinc-100">{value}</span>
    </div>
  );
}

export function DmOperationalDrawer({
  open,
  view,
  escalationLogs,
  onClose,
  onEscalation,
  onSelectJob,
}: DmOperationalDrawerProps) {
  if (!open || !view) return null;

  const job = view.primaryJob;

  return (
    <>
      <button
        type="button"
        aria-label="Close operational drawer"
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-labelledby="dm-operational-drawer-title"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/50"
      >
        <header className="border-b border-zinc-800 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-teal-400/90">
                Territory drilldown
              </p>
              <h2 id="dm-operational-drawer-title" className="mt-1 text-lg font-semibold text-zinc-50">
                {view.title}
              </h2>
              <p className="mt-1 text-sm text-zinc-500">{view.subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Close
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {job ? (
            <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4">
              <h3 className="text-sm font-semibold text-zinc-100">Job details</h3>
              <div className="mt-3 space-y-2">
                <DetailRow label="City / state" value={`${job.city}, ${job.state}`} />
                <DetailRow
                  label="Job age"
                  value={job.jobAgeDays !== null ? `${job.jobAgeDays} days` : "—"}
                />
                <DetailRow label="Applicants" value={job.applicantCount.toLocaleString()} />
                <DetailRow label="Interviewing" value={job.interviewingCount.toLocaleString()} />
                <DetailRow
                  label="Last applicant"
                  value={
                    job.lastApplicantAt
                      ? `${formatWhen(job.lastApplicantAt)}${job.daysSinceLastApplicant !== null ? ` (${job.daysSinceLastApplicant}d ago)` : ""}`
                      : "No applicants in snapshot"
                  }
                />
                <DetailRow label="Pay range" value={job.payRange ?? "Not in snapshot"} />
                <DetailRow label="Recruiter assigned" value={job.assignedRecruiter ?? "Unassigned"} />
                <DetailRow label="Priority" value={job.priority ?? "—"} />
                <DetailRow label="Recommended action" value={job.recommendedAction ?? "—"} />
              </div>
            </section>
          ) : (
            <p className="text-sm text-zinc-500">No single job selected — review city/state coverage below.</p>
          )}

          <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4">
            <h3 className="text-sm font-semibold text-zinc-100">Coverage context</h3>
            <div className="mt-3 space-y-2">
              <DetailRow label="Territory demand" value={view.demandLevel} />
              <DetailRow
                label="Nearby open jobs"
                value={view.nearbyJobs.length.toLocaleString()}
              />
              <DetailRow
                label="Nearby reps"
                value={
                  view.nearbyRepsCount !== null
                    ? view.nearbyRepsCount.toLocaleString()
                    : "Not in territory snapshot"
                }
              />
            </div>
            {view.nearbyJobs.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {view.nearbyJobs.map((row) => (
                  <li key={row.jobId}>
                    <button
                      type="button"
                      onClick={() => onSelectJob?.(row.jobId)}
                      className="w-full rounded-lg border border-zinc-800 px-3 py-2 text-left text-xs hover:bg-zinc-800/60"
                    >
                      <span className="font-medium text-zinc-200">{row.title}</span>
                      <span className="mt-0.5 block text-zinc-500">
                        {row.city}, {row.state} · {row.applicantCount} applicants
                        {row.priority ? ` · ${row.priority}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {job ? (
            <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4">
              <h3 className="text-sm font-semibold text-zinc-100">Candidate snapshot</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    ["Applied", job.candidateCounts.applied],
                    ["Interviewing", job.candidateCounts.interviewing],
                    ["Hired", job.candidateCounts.hired],
                    ["Stalled", job.candidateCounts.stalled],
                  ] as const
                ).map(([label, count]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-center"
                  >
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-50">{count}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {view.relatedAlerts.length > 0 ? (
            <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4">
              <h3 className="text-sm font-semibold text-zinc-100">Related alerts</h3>
              <ul className="mt-3 space-y-2">
                {view.relatedAlerts.map((alert) => (
                  <li
                    key={alert.id}
                    className="rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-300"
                  >
                    <span className="font-medium uppercase text-zinc-400">{alert.priority}</span>
                    <p className="mt-1 font-medium text-zinc-100">{alert.title}</p>
                    <p className="mt-0.5 text-zinc-500">{alert.recommendedAction}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-4">
            <h3 className="text-sm font-semibold text-violet-100">Recruiter escalation (log only)</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Actions are stored locally for audit history — nothing is sent to recruiting yet.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ESCALATION_ACTIONS.map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled={!job}
                  onClick={() => onEscalation(action)}
                  className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-100 hover:bg-violet-500/20 disabled:opacity-40"
                >
                  {DM_ESCALATION_ACTION_LABELS[action]}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 p-4">
            <h3 className="text-sm font-semibold text-zinc-100">Activity history</h3>
            {escalationLogs.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No escalation requests logged yet.</p>
            ) : (
              <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                {escalationLogs.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-300"
                  >
                    <p className="font-medium text-zinc-100">
                      {entry.label}
                      {entry.jobTitle ? ` · ${entry.jobTitle}` : ""}
                    </p>
                    <p className="mt-0.5 text-zinc-500">
                      {entry.dmUserName} · {formatWhen(entry.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
