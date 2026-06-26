"use client";

import Link from "next/link";
import { CardSkeleton, EmptyState, ExecutiveCard, ExecutiveButton, IconPipeline, SectionHeader } from "@/components/executive/ui";
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
    <ExecutiveCard>
      <SectionHeader
        title="Pipeline health"
        subtitle="Funnel conversion, SLA pressure, and territory bottlenecks."
        actions={
          <Link
            href="/?tab=pipeline-intelligence"
            className="rounded-lg bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-100 ring-1 ring-inset ring-teal-500/25 transition-colors hover:bg-teal-500/15"
          >
            Full pipeline view
          </Link>
        }
      />

      {showLoading ? (
        <div className="mt-6">
          <CardSkeleton lines={4} />
        </div>
      ) : null}

      {(error || loadingCeilingHit) && !data ? (
        <div className="mt-4 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-4 py-4 text-sm text-zinc-300">
          <p className="font-medium text-zinc-100">Pipeline metrics are not ready yet</p>
          <p className="mt-1 text-zinc-500">
            {error ?? "Loading is taking longer than expected. You can retry or open the full pipeline view."}
          </p>
          <ExecutiveButton onClick={() => refresh()}>Retry</ExecutiveButton>
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
            <h3 className="text-sm font-semibold text-zinc-400">Funnel conversion</h3>
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
            <h3 className="text-sm font-semibold text-zinc-400">SLA violations</h3>
            {slaViolations.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  icon={<IconPipeline size={18} />}
                  title="No SLA violations"
                  description="No candidates are beyond SLA right now."
                />
              </div>
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
            <h3 className="text-sm font-semibold text-zinc-400">Top bottleneck territories</h3>
            {bottleneckTerritories.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="No bottlenecks detected" description="Territory pipeline flow looks clear." />
              </div>
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
    </ExecutiveCard>
  );
}
