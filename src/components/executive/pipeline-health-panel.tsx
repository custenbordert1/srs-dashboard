"use client";

import Link from "next/link";
import { usePipelineIntelligence } from "@/hooks/use-pipeline-intelligence";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";

const TREND_LABELS = {
  up: "Improving",
  down: "Declining",
  flat: "Stable",
} as const;

export function PipelineHealthPanel() {
  const { data, loading, error, showingCachedSnapshot, meta, refresh } = usePipelineIntelligence();
  const loadingCeilingHit = useLoadingCeiling(loading && !data, EXECUTIVE_PANEL_LOADING_CEILING_MS);
  const showLoading = loading && !data && !loadingCeilingHit;

  const slaViolations = data?.slaTracking.filter((row) => row.beyondSlaCount > 0) ?? [];
  const bottleneckTerritories = data?.executive.topBottleneckTerritories ?? [];

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Pipeline health</h2>
          <p className="mt-1 text-sm text-zinc-500">Funnel conversion, SLA pressure, and territory bottlenecks.</p>
        </div>
        <Link
          href="/?tab=pipeline-intelligence"
          className="rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-xs text-teal-100"
        >
          Full pipeline view
        </Link>
      </div>

      {showLoading ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-10 animate-pulse rounded bg-zinc-800/80" />
          ))}
        </div>
      ) : null}

      {(error || loadingCeilingHit) && !data ? (
        <div className="mt-4 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-4 py-4 text-sm text-zinc-300">
          <p className="font-medium text-zinc-100">Pipeline metrics are not ready yet</p>
          <p className="mt-1 text-zinc-500">
            {error ?? "Loading is taking longer than expected. You can retry or open the full pipeline view."}
          </p>
          <button
            type="button"
            onClick={() => refresh()}
            className="mt-3 rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Retry
          </button>
        </div>
      ) : null}

      {showingCachedSnapshot || meta?.partialSync ? (
        <p className="mt-2 text-xs text-amber-200/90">
          {showingCachedSnapshot
            ? "Showing last loaded pipeline snapshot."
            : "Partial sync — metrics may update as Breezy cache fills."}
        </p>
      ) : null}

      {data ? (
        <div className="mt-4 space-y-6">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Funnel conversion</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-[480px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                    <th className="pb-2 pr-3">Transition</th>
                    <th className="pb-2 pr-3 text-right">At stage</th>
                    <th className="pb-2 text-right">Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {data.funnelTransitions.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-800/60">
                      <td className="py-2 pr-3 font-medium text-zinc-200">{row.label}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-zinc-300">{row.count}</td>
                      <td className="py-2 text-right tabular-nums text-zinc-300">
                        {row.conversionPct !== null ? `${row.conversionPct}%` : "—"}
                        <span className="ml-2 text-xs text-zinc-500">{TREND_LABELS[row.trend]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">SLA violations</h3>
            {slaViolations.length === 0 ? (
              <p className="mt-2 rounded-lg border border-teal-500/25 bg-teal-500/10 px-3 py-2 text-sm text-teal-100">
                No candidates are beyond SLA right now.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {slaViolations.map((row) => (
                  <li
                    key={row.stage}
                    className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
                  >
                    <span className="font-medium">{row.label}</span>
                    <span className="ml-2 text-xs opacity-90">
                      {row.beyondSlaCount} beyond SLA · {row.severity}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Top bottleneck territories
            </h3>
            {bottleneckTerritories.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No territory bottlenecks detected.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {bottleneckTerritories.slice(0, 5).map((row) => (
                  <li
                    key={row.dmName}
                    className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-300"
                  >
                    <p className="font-medium text-zinc-100">{row.territoryLabel}</p>
                    <p className="mt-0.5 text-xs text-amber-200">
                      {row.bottleneck.stage} · {row.bottleneck.count} stalled
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
