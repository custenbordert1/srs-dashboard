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
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Quick-read signals</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {intelligence.signalBadges.map((badge) => (
                <span
                  key={badge.id}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    badge.detected
                      ? "border-teal-500/40 bg-teal-500/15 text-teal-100"
                      : "border-zinc-700 bg-zinc-950/60 text-zinc-500"
                  }`}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          </div>

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
                    className="rounded-full border border-zinc-700 bg-zinc-950/60 px-2 py-0.5 text-xs text-zinc-300"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Resume quality</p>
            <ul className="mt-1 space-y-1 text-zinc-300">
              <li>
                Employment history:{" "}
                {intelligence.quality.employmentHistoryCount === null
                  ? "—"
                  : `${intelligence.quality.employmentHistoryCount} role${intelligence.quality.employmentHistoryCount === 1 ? "" : "s"}`}
              </li>
              <li>
                Longest tenure: {intelligence.quality.longestTenureLabel ?? "Not detected"}
              </li>
              <li>
                Employment gaps:{" "}
                {intelligence.quality.employmentGapsDetected > 0
                  ? `${intelligence.quality.employmentGapsDetected} detected`
                  : "None detected"}
              </li>
              <li>Completeness: {intelligence.quality.completenessLabel}</li>
            </ul>
          </div>

          {intelligence.employmentGaps.length > 0 ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Employment gaps</p>
              <ul className="mt-1 list-inside list-disc space-y-1 text-amber-100/80">
                {intelligence.employmentGaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
