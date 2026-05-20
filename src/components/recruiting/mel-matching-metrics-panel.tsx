"use client";

import type { DmMelMatchingMetrics, ExecutiveMelMatchingMetrics } from "@/lib/mel-matching/mel-matching-metrics";

type ExecutiveMelMatchingPanelProps = {
  metrics: ExecutiveMelMatchingMetrics;
  onCandidateClick?: (candidateId: string) => void;
};

export function ExecutiveMelMatchingPanel({
  metrics,
  onCandidateClick,
}: ExecutiveMelMatchingPanelProps) {
  return (
    <section className="rounded-2xl border border-violet-500/20 bg-zinc-900/40 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-zinc-50">MEL opportunity matching</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Candidate-to-store fit across open MEL programs
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3">
          <p className="text-xs uppercase text-zinc-500">No nearby opportunities</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-200">
            {metrics.candidatesWithNoNearbyOpportunities}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3">
          <p className="text-xs uppercase text-zinc-500">Hard-to-fill (low fit)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-red-200">
            {metrics.hardToFillOpportunitiesLackingCandidates}
          </p>
        </article>
        <article className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3 sm:col-span-2">
          <p className="text-xs uppercase text-zinc-500">Territory coverage gaps</p>
          <p className="mt-1 text-sm text-zinc-300">
            {metrics.territoryCoverageGaps.length === 0
              ? "No major gaps detected"
              : metrics.territoryCoverageGaps
                  .map((g) => `${g.territory} (${g.openUnstaffed} open, ${g.strongMatches} strong matches)`)
                  .join(" · ")}
          </p>
        </article>
      </div>

      {metrics.topCandidateProjectMatches.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">Candidate</th>
                <th className="pb-2 pr-3">Project</th>
                <th className="pb-2 pr-3">Fit</th>
                <th className="pb-2 pr-3">Distance</th>
                <th className="pb-2">Label</th>
              </tr>
            </thead>
            <tbody>
              {metrics.topCandidateProjectMatches.map((row) => (
                <tr key={`${row.candidateId}-${row.opportunityId}`} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3">
                    {onCandidateClick ? (
                      <button
                        type="button"
                        onClick={() => onCandidateClick(row.candidateId)}
                        className="font-medium text-teal-200 hover:underline"
                      >
                        {row.candidateName}
                      </button>
                    ) : (
                      <span className="text-zinc-200">{row.candidateName}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-zinc-400">
                    {row.projectName}
                    <span className="block text-xs text-zinc-600">{row.client}</span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-teal-200">{row.fitPercent}%</td>
                  <td className="py-2 pr-3 text-zinc-400">
                    {row.distanceMiles !== null ? `${row.distanceMiles} mi` : "—"}
                  </td>
                  <td className="py-2 text-xs text-zinc-500">{row.matchLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

type DmMelMatchingPanelProps = {
  metrics: DmMelMatchingMetrics;
  onCandidateClick?: (candidateId: string) => void;
};

export function DmMelMatchingPanel({ metrics, onCandidateClick }: DmMelMatchingPanelProps) {
  return (
    <section className="rounded-2xl border border-violet-500/20 bg-zinc-900/40 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-zinc-50">MEL staffing matches</h2>
      <p className="mt-1 text-sm text-zinc-500">Best candidates for open projects in your territory</p>

      {metrics.unstaffedHighPriorityStores.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase text-red-200/80">Unstaffed high-priority stores</p>
          <ul className="mt-2 space-y-1 text-sm text-zinc-300">
            {metrics.unstaffedHighPriorityStores.map((store) => (
              <li key={`${store.projectName}-${store.storeName}`} className="rounded border border-zinc-800/60 px-2 py-1">
                {store.projectName} · {store.client} · {store.storeName}, {store.state}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {metrics.bestCandidateForOpenProjects.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase text-zinc-500">Best candidate per open project</p>
          <ul className="mt-2 space-y-2">
            {metrics.bestCandidateForOpenProjects.map((row) => (
              <li
                key={`${row.projectName}-${row.candidateId}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-zinc-200">{row.projectName}</p>
                  <p className="text-xs text-zinc-500">{row.client}</p>
                </div>
                <div className="text-right">
                  {onCandidateClick ? (
                    <button
                      type="button"
                      onClick={() => onCandidateClick(row.candidateId)}
                      className="font-medium text-teal-200 hover:underline"
                    >
                      {row.candidateName}
                    </button>
                  ) : (
                    <span className="text-zinc-200">{row.candidateName}</span>
                  )}
                  <p className="text-xs tabular-nums text-teal-300/80">
                    {row.fitPercent}% · {row.distanceMiles !== null ? `${row.distanceMiles} mi` : "—"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {metrics.candidatesNearAgingOpportunities.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase text-zinc-500">Candidates near aging opportunities</p>
          <ul className="mt-2 space-y-1 text-sm text-zinc-400">
            {metrics.candidatesNearAgingOpportunities.map((row) => (
              <li key={`${row.candidateId}-${row.projectName}`}>
                {onCandidateClick ? (
                  <button
                    type="button"
                    onClick={() => onCandidateClick(row.candidateId)}
                    className="text-teal-200 hover:underline"
                  >
                    {row.candidateName}
                  </button>
                ) : (
                  row.candidateName
                )}{" "}
                → {row.projectName} ({row.fitPercent}%, {row.distanceMiles ?? "—"} mi)
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
