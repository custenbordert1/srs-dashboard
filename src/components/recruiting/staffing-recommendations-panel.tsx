"use client";

import type { StaffingRecommendationRow } from "@/lib/rep-intelligence/rep-types";

const PRIORITY_STYLES = {
  critical: "border-red-500/35 bg-red-500/10 text-red-100",
  high: "border-amber-500/35 bg-amber-500/10 text-amber-100",
  medium: "border-zinc-600/40 bg-zinc-800/50 text-zinc-300",
} as const;

type StaffingRecommendationsPanelProps = {
  recommendations: StaffingRecommendationRow[];
};

export function StaffingRecommendationsPanel({ recommendations }: StaffingRecommendationsPanelProps) {
  return (
    <section className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">AI staffing recommendations</h3>
      <p className="mt-1 text-xs text-zinc-500">
        Read-only intelligence — assignment actions stay outside this dashboard until write integrations ship.
      </p>

      {recommendations.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">No staffing recommendations for current territory.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {recommendations.map((rec) => (
            <li
              key={rec.id}
              className={`rounded-lg border px-3 py-2.5 ${PRIORITY_STYLES[rec.priority]}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-medium">{rec.title}</p>
                <span className="text-[10px] font-semibold uppercase opacity-80">{rec.priority}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed opacity-90">{rec.summary}</p>
              <p className="mt-2 text-[11px] font-medium text-teal-200/90">→ {rec.recommendedAction}</p>
              {rec.repName ? (
                <p className="mt-1 text-[10px] opacity-70">
                  {rec.repName}
                  {rec.matchScore !== undefined ? ` · ${rec.matchScore}% fit` : ""}
                  {rec.distanceMiles !== undefined && rec.distanceMiles !== null
                    ? ` · ${rec.distanceMiles} mi`
                    : ""}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
