"use client";

import type { CandidateResumeIntelligence } from "@/lib/candidate-readiness/types";

const NOT_AVAILABLE = "Not available from Breezy yet.";

type CandidateResumeIntelligencePanelProps = {
  intelligence: CandidateResumeIntelligence;
};

export function CandidateResumeIntelligencePanel({ intelligence }: CandidateResumeIntelligencePanelProps) {
  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">Resume intelligence</h3>

      {!intelligence.available ? (
        <p className="mt-3 text-sm text-zinc-500">{NOT_AVAILABLE}</p>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Summary</p>
            <p className="mt-1 text-zinc-300">{intelligence.summary ?? "No summary extracted."}</p>
          </div>

          {intelligence.workHistoryHighlights.length > 0 ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Work history highlights</p>
              <ul className="mt-1 list-inside list-disc space-y-1 text-zinc-300">
                {intelligence.workHistoryHighlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {intelligence.relevantSkills.length > 0 ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Relevant skills</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {intelligence.relevantSkills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-xs text-teal-100"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Experience flags</p>
            <ul className="mt-1 space-y-1 text-zinc-300">
              <li>
                Phone/customer service:{" "}
                {intelligence.phoneCustomerServiceExperience === null
                  ? "Not detected"
                  : intelligence.phoneCustomerServiceExperience
                    ? "Yes"
                    : "No"}
              </li>
              <li>
                Merchandising/retail:{" "}
                {intelligence.merchandisingRetailExperience === null
                  ? "Not detected"
                  : intelligence.merchandisingRetailExperience
                    ? "Yes"
                    : "No"}
              </li>
              {intelligence.employmentGaps.length > 0 ? (
                intelligence.employmentGaps.map((gap) => <li key={gap}>{gap}</li>)
              ) : (
                <li>No employment gaps detected</li>
              )}
            </ul>
          </div>

          {intelligence.experienceFlags.length > 0 ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Flags</p>
              <ul className="mt-1 list-inside list-disc space-y-1 text-zinc-400">
                {intelligence.experienceFlags.map((flag) => (
                  <li key={flag}>{flag}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
