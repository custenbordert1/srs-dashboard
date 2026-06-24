"use client";

import { progressionBadgeStyle } from "@/lib/candidate-progression-engine/progression-sort";
import type { RecruiterActionPriority } from "@/lib/candidate-workflow-types";

type CandidateProgressionPanelProps = {
  recommendedStage?: string | null;
  progressionPriority?: RecruiterActionPriority | null;
  progressionReason?: string | null;
  progressionConfidence?: number | null;
  progressionGeneratedAt?: string | null;
};

export function CandidateProgressionPanel({
  recommendedStage,
  progressionPriority,
  progressionReason,
  progressionConfidence,
  progressionGeneratedAt,
}: CandidateProgressionPanelProps) {
  if (!recommendedStage?.trim()) return null;

  const priority = progressionPriority ?? "medium";
  const tone = progressionBadgeStyle(recommendedStage, priority);

  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        Candidate Progression Engine
      </p>
      <div className={`mt-3 rounded-lg border px-3 py-3 ${tone}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Recommended Stage</p>
            <p className="mt-1 text-base font-semibold">{recommendedStage}</p>
          </div>
          <span className="rounded-md border border-current/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
            {priority} priority
          </span>
        </div>
        {progressionReason ? <p className="mt-2 text-sm text-zinc-300">{progressionReason}</p> : null}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-400">
          {typeof progressionConfidence === "number" ? (
            <span>
              Confidence: <span className="font-medium text-zinc-200">{progressionConfidence}%</span>
            </span>
          ) : null}
          {progressionGeneratedAt ? (
            <span>
              Generated:{" "}
              <span className="font-medium text-zinc-200">
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(progressionGeneratedAt))}
              </span>
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
