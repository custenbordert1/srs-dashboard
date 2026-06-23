"use client";

import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { RecruiterRosters } from "@/lib/candidate-workflow-types";

type CandidateAssignmentPanelProps = {
  assignedRecruiter: string;
  actingRecruiter: string;
  rosters: RecruiterRosters;
  busy?: boolean;
  onAssignToMe: () => void;
  onAssignRecruiter: (recruiter: string) => void;
};

export function CandidateAssignmentPanel({
  assignedRecruiter,
  actingRecruiter,
  rosters,
  busy = false,
  onAssignToMe,
  onAssignRecruiter,
}: CandidateAssignmentPanelProps) {
  if (!isUnassignedRecruiter(assignedRecruiter)) return null;

  return (
    <section className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-200/90">Owner required</p>
      <h3 className="mt-1 text-sm font-semibold text-zinc-50">Assign a recruiter before outreach</h3>
      <p className="mt-2 text-sm text-zinc-400">
        This candidate is unassigned. Claim ownership or route to the correct recruiter to continue.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onAssignToMe}
          className="rounded-lg border border-teal-500/40 bg-teal-500/15 px-4 py-2 text-sm font-semibold text-teal-100 hover:bg-teal-500/25 disabled:opacity-40"
        >
          Assign to me
        </button>

        <label className="flex min-w-[10rem] flex-col gap-1 text-[10px] text-zinc-500">
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
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="">Choose recruiter…</option>
            {rosters.recruiters
              .filter((name) => !isUnassignedRecruiter(name))
              .map((name) => (
                <option key={name} value={name}>
                  {name}
                  {name === actingRecruiter ? " (you)" : ""}
                </option>
              ))}
          </select>
        </label>
      </div>
    </section>
  );
}
