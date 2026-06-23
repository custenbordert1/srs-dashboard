"use client";

import type { RecruiterCopilotRecommendation } from "@/lib/hiring-funnel-automation/types";
import type { RecruiterRosters } from "@/lib/candidate-workflow-types";

type CandidateCopilotPanelProps = {
  copilot: RecruiterCopilotRecommendation;
  showAssignmentActions?: boolean;
  actingRecruiter?: string;
  rosters?: RecruiterRosters;
  busy?: boolean;
  onAssignToMe?: () => void;
  onAssignRecruiter?: (recruiter: string) => void;
};

export function CandidateCopilotPanel({
  copilot,
  showAssignmentActions = false,
  actingRecruiter,
  rosters,
  busy = false,
  onAssignToMe,
  onAssignRecruiter,
}: CandidateCopilotPanelProps) {
  return (
    <section className="rounded-xl border border-teal-500/25 bg-gradient-to-br from-teal-500/10 to-zinc-900/40 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-teal-300/90">Recruiter copilot</p>
      <h3 className="mt-1 text-sm font-semibold text-zinc-50">{copilot.headline}</h3>

      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Why</dt>
          <dd className="mt-1 text-zinc-300">{copilot.why}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Recommended action</dt>
          <dd className="mt-1 text-teal-100">{copilot.recommendedAction}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Expected outcome</dt>
          <dd className="mt-1 text-zinc-300">{copilot.expectedOutcome}</dd>
        </div>
      </dl>

      {showAssignmentActions && onAssignToMe && rosters ? (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-teal-500/20 pt-4">
          <button
            type="button"
            disabled={busy}
            onClick={onAssignToMe}
            className="rounded-lg border border-teal-500/40 bg-teal-500/15 px-3 py-1.5 text-xs font-semibold text-teal-100 hover:bg-teal-500/25 disabled:opacity-40"
          >
            Assign to me
          </button>
          {onAssignRecruiter ? (
            <label className="flex min-w-[9rem] flex-col gap-1 text-[10px] text-zinc-500">
              Assign recruiter
              <select
                disabled={busy}
                defaultValue=""
                onChange={(event) => {
                  const recruiter = event.target.value;
                  if (!recruiter) return;
                  onAssignRecruiter(recruiter);
                  event.target.value = "";
                }}
                className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100"
              >
                <option value="">Choose…</option>
                {rosters.recruiters
                  .filter((name) => name.trim().toLowerCase() !== "unassigned")
                  .map((name) => (
                    <option key={name} value={name}>
                      {name}
                      {name === actingRecruiter ? " (you)" : ""}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
