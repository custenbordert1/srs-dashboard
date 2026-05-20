"use client";

import type { OpportunityBestRepMatches } from "@/lib/rep-intelligence/rep-types";

type BestRepMatchSectionProps = {
  opportunityMatches: OpportunityBestRepMatches[];
  loading?: boolean;
};

export function BestRepMatchSection({ opportunityMatches, loading = false }: BestRepMatchSectionProps) {
  const withReps = opportunityMatches.filter((o) => o.topReps.length > 0);
  if (!loading && withReps.length === 0) return null;

  return (
    <section className="mt-4 space-y-3 rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-200/80">
          Best rep match
        </p>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Top workforce reps for matched MEL opportunities (read-only)
        </p>
      </div>

      {loading ? <p className="text-xs text-zinc-500">Loading rep recommendations…</p> : null}

      {withReps.map((block) => (
        <div key={block.opportunityId} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3">
          <p className="text-sm font-medium text-zinc-200">{block.projectName}</p>
          <ul className="mt-2 space-y-2">
            {block.topReps.map((rep) => (
              <li
                key={rep.repId}
                className="flex flex-wrap items-start justify-between gap-2 border-t border-zinc-800/60 pt-2 first:border-0 first:pt-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-teal-200">
                    {rep.repName}{" "}
                    <span className="text-zinc-500">({rep.srsId})</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">{rep.recommendationReason}</p>
                  {rep.skillOverlap.length > 0 ? (
                    <p className="mt-1 text-[10px] text-violet-300/90">
                      Skills: {rep.skillOverlap.join(", ")}
                    </p>
                  ) : null}
                </div>
                <div className="text-right text-xs">
                  <p className="font-semibold tabular-nums text-teal-200">{rep.matchScore}%</p>
                  <p className="text-zinc-500">
                    {rep.distanceMiles !== null ? `${rep.distanceMiles} mi` : "—"}
                    {rep.lastLoginDaysAgo !== null ? ` · ${rep.lastLoginDaysAgo}d login` : ""}
                  </p>
                  {!rep.active ? (
                    <span className="text-[10px] text-amber-400">Inactive</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
