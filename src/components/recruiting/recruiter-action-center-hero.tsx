"use client";

import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { RecruiterRosters } from "@/lib/candidate-workflow-types";

type RecruiterActionCenterHeroProps = {
  actingRecruiter: string;
  rosters: RecruiterRosters;
  onActingRecruiterChange: (name: string) => void;
};

export function RecruiterActionCenterHero({
  actingRecruiter,
  rosters,
  onActingRecruiterChange,
}: RecruiterActionCenterHeroProps) {
  return (
    <section className="rounded-2xl border border-teal-500/25 bg-gradient-to-br from-teal-500/10 via-zinc-900/60 to-zinc-900/40 p-5 shadow-lg shadow-black/20 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-teal-300/90">
            Recruiter inbox
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">Candidates</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Who to contact next — work today&apos;s queues first, then search the database.
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
          <span className="text-[10px] text-zinc-500">Working as {actingRecruiter}</span>
        </label>
      </div>
    </section>
  );
}
