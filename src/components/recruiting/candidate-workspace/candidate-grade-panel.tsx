"use client";

import type { CandidateReadinessScore } from "@/lib/candidate-readiness/types";

const GRADE_STYLES: Record<CandidateReadinessScore["grade"], string> = {
  A: "border-emerald-500/40 bg-emerald-500/15 text-emerald-100",
  B: "border-teal-500/40 bg-teal-500/15 text-teal-100",
  C: "border-amber-500/40 bg-amber-500/15 text-amber-100",
  D: "border-rose-500/40 bg-rose-500/15 text-rose-100",
};

type CandidateGradePanelProps = {
  grade: CandidateReadinessScore;
};

export function CandidateGradePanel({ grade }: CandidateGradePanelProps) {
  const enriching = grade.overallScore === 0 && grade.concerns.some((c) => c.includes("Enriching"));

  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">Candidate grade</h3>

      <div className="mt-3 flex items-center gap-3">
        <div className="text-2xl font-semibold text-zinc-50">
          {enriching ? "…" : `${grade.overallScore}`}
          <span className="text-sm font-normal text-zinc-500"> / 100</span>
        </div>
        <span
          className={`rounded-md border px-2.5 py-1 text-sm font-semibold ${GRADE_STYLES[grade.grade]}`}
        >
          Grade {grade.grade}
        </span>
      </div>

      {grade.strengths.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Strengths</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-teal-100/90">
            {grade.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {grade.concerns.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Concerns</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-amber-100/90">
            {grade.concerns.map((item) => (
              <li key={item}>{item}</li>
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
