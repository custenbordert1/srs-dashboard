"use client";

import type { CandidateOpportunityMatch, MatchLabel } from "@/lib/mel-matching/matching-engine-types";

const MATCH_LABEL_STYLES: Record<MatchLabel, string> = {
  "Strong Match": "border-emerald-500/35 bg-emerald-500/15 text-emerald-200",
  "Good Match": "border-teal-500/35 bg-teal-500/15 text-teal-200",
  "Stretch Match": "border-amber-500/35 bg-amber-500/15 text-amber-200",
  "Outside Territory": "border-zinc-600/50 bg-zinc-800/60 text-zinc-400",
};

const PRIORITY_STYLES = {
  high: "border-red-500/35 bg-red-500/10 text-red-200",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  low: "border-zinc-600/40 bg-zinc-800/50 text-zinc-400",
} as const;

type MatchedOpportunitiesSectionProps = {
  matches: CandidateOpportunityMatch[];
  aiSummary: string;
  loading?: boolean;
};

export function MatchedOpportunitiesSection({
  matches,
  aiSummary,
  loading = false,
}: MatchedOpportunitiesSectionProps) {
  return (
    <section className="space-y-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-200/80">
          Matched opportunities
        </p>
        <p className="mt-0.5 text-[11px] text-zinc-500">MEL store calls ranked by fit and distance</p>
      </header>

      {loading ? <p className="text-xs text-zinc-500">Loading MEL opportunities…</p> : null}

      {!loading && aiSummary ? (
        <p className="rounded-lg border border-violet-500/20 bg-zinc-950/60 px-3 py-2 text-xs leading-relaxed text-violet-100/90">
          {aiSummary}
        </p>
      ) : null}

      {!loading && matches.length === 0 ? (
        <p className="text-xs text-zinc-500">No open MEL opportunities matched for this candidate.</p>
      ) : null}

      <ul className="space-y-2">
        {matches.map((match) => (
          <li
            key={match.opportunityId}
            className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 px-3 py-2.5"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-100">{match.projectName}</p>
                <p className="text-[11px] text-zinc-500">{match.client}</p>
              </div>
              <span className="text-lg font-semibold tabular-nums text-teal-200">{match.fitPercent}%</span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${MATCH_LABEL_STYLES[match.matchLabel]}`}
              >
                {match.matchLabel}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase ${PRIORITY_STYLES[match.priority]}`}
              >
                {match.priority} priority
              </span>
              {match.distanceMiles !== null ? (
                <span className="rounded-full border border-zinc-700/80 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400">
                  {match.distanceMiles} mi
                </span>
              ) : null}
              <span className="rounded-full border border-zinc-700/80 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400">
                {match.territory}
              </span>
            </div>

            <p className="mt-2 text-[11px] leading-snug text-zinc-500">{match.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
