"use client";

import type { CandidateReadinessScore } from "@/lib/candidate-readiness/types";

const CONFIDENCE_STYLES: Record<CandidateReadinessScore["confidence"], string> = {
  high: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  low: "border-zinc-600 bg-zinc-900 text-zinc-400",
};

type CandidateGradePanelProps = {
  grade: CandidateReadinessScore;
};

export function CandidateGradePanel({ grade }: CandidateGradePanelProps) {
  const enriching = grade.overallScore === 0 && grade.concerns.some((c) => c.includes("Enriching"));
  const positives = grade.gradeContributors.filter((item) => item.kind === "positive");
  const negatives = grade.gradeContributors.filter((item) => item.kind === "negative");

  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">Candidate grade</h3>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="text-2xl font-semibold text-zinc-50">
          {enriching ? "…" : `Grade ${grade.grade}`}
          {!enriching ? <span className="text-base font-normal text-zinc-400"> ({grade.overallScore})</span> : null}
        </div>
        {!enriching ? (
          <span
            className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${CONFIDENCE_STYLES[grade.confidence]}`}
          >
            {grade.confidenceLabel}
          </span>
        ) : null}
      </div>

      {!enriching && positives.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Positive contributors</p>
          <ul className="mt-2 space-y-1 text-sm">
            {positives.map((item) => (
              <li key={item.label} className="text-teal-100/90">
                + {item.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!enriching && negatives.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Negative contributors</p>
          <ul className="mt-2 space-y-1 text-sm">
            {negatives.map((item) => (
              <li key={item.label} className="text-amber-100/90">
                − {item.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 rounded-lg border border-zinc-700/60 bg-zinc-950/50 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Recommended next action</p>
        <p className="mt-1 text-sm text-zinc-200">{grade.recommendedNextAction}</p>
      </div>
    </section>
  );
}
