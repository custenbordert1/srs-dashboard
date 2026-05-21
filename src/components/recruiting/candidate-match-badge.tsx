"use client";

import type { CandidateMatchLevel } from "@/lib/recruiting-intelligence";

export const MATCH_LEVEL_STYLES: Record<CandidateMatchLevel, string> = {
  high: "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/35",
  medium: "bg-sky-500/15 text-sky-200 ring-1 ring-sky-500/35",
  low: "bg-zinc-500/15 text-zinc-300 ring-1 ring-zinc-500/30",
  no_resume: "bg-amber-500/15 text-amber-100 ring-1 ring-amber-500/35",
};

export const MATCH_LEVEL_LABELS: Record<CandidateMatchLevel, string> = {
  high: "High match",
  medium: "Medium match",
  low: "Low match",
  no_resume: "No resume",
};

export function CandidateMatchBadge({
  matchPercent,
  matchLevel,
  isTopMatch = false,
  compact = false,
}: {
  matchPercent: number;
  matchLevel: CandidateMatchLevel;
  isTopMatch?: boolean;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${MATCH_LEVEL_STYLES[matchLevel]}`}
      >
        {matchPercent}%
        {!compact ? <span className="font-normal opacity-80">{MATCH_LEVEL_LABELS[matchLevel]}</span> : null}
      </span>
      {isTopMatch ? (
        <span className="inline-flex rounded-full bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-200 ring-1 ring-violet-500/40">
          Top match
        </span>
      ) : null}
    </span>
  );
}
