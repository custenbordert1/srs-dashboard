"use client";

import type { RepProjectMatchRow } from "@/lib/rep-intelligence/rep-types";

const FIT_STYLES: Record<string, string> = {
  strong: "text-emerald-200 border-emerald-500/30 bg-emerald-500/10",
  good: "text-teal-200 border-teal-500/30 bg-teal-500/10",
  stretch: "text-amber-200 border-amber-500/30 bg-amber-500/10",
  poor: "text-zinc-400 border-zinc-600/40 bg-zinc-800/40",
};

type ActiveRepMatchingPanelProps = {
  matches: RepProjectMatchRow[];
  geocodedRepCount?: number;
};

export function ActiveRepMatchingPanel({ matches, geocodedRepCount = 0 }: ActiveRepMatchingPanelProps) {
  return (
    <section className="rounded-xl border border-teal-500/20 bg-zinc-900/40 p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Active rep matching</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Rep-to-project fit ranked by score, distance, and reliability
          </p>
        </div>
        {geocodedRepCount > 0 ? (
          <span className="text-[10px] text-teal-300/80">{geocodedRepCount} reps geocoded (Nominatim)</span>
        ) : null}
      </div>

      {matches.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">No rep-project matches above threshold.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">Rep</th>
                <th className="pb-2 pr-3">Project</th>
                <th className="pb-2 pr-3">Fit</th>
                <th className="pb-2 pr-3">Distance</th>
                <th className="pb-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {matches.slice(0, 20).map((row) => (
                <tr key={`${row.repId}-${row.opportunityId}`} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 font-medium text-zinc-200">{row.repName}</td>
                  <td className="py-2 pr-3 text-zinc-400">
                    {row.projectName}
                    <span className="block text-xs text-zinc-600">{row.client}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${FIT_STYLES[row.fitLevel] ?? FIT_STYLES.poor}`}
                    >
                      {row.matchScore}% · {row.fitLevel}
                    </span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-400">
                    {row.distanceMiles !== null ? `${row.distanceMiles} mi` : "—"}
                  </td>
                  <td className="py-2 text-xs text-zinc-500">{row.recommendedAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
