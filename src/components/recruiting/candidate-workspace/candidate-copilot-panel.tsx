"use client";

import type { RecruiterCopilotRecommendation } from "@/lib/hiring-funnel-automation/types";

type CandidateCopilotPanelProps = {
  copilot: RecruiterCopilotRecommendation;
};

export function CandidateCopilotPanel({ copilot }: CandidateCopilotPanelProps) {
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
    </section>
  );
}
