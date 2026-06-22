"use client";

import Link from "next/link";
import { usePipelineIntelligence } from "@/hooks/use-pipeline-intelligence";
import { pipelineQueueHref } from "@/lib/pipeline-intelligence";
import type { BottleneckSeverity } from "@/lib/pipeline-intelligence";

const SEVERITY_STYLES: Record<BottleneckSeverity, string> = {
  normal: "border-zinc-700 text-zinc-400",
  warning: "border-amber-500/40 text-amber-200",
  high: "border-orange-500/40 text-orange-200",
  critical: "border-red-500/40 text-red-200",
};

export function PipelineHealthPanel() {
  const { data, loading, error } = usePipelineIntelligence();

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Pipeline Health</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Bottlenecks, conversion rankings, and recruiter support needs from live pipeline intelligence.
          </p>
        </div>
        <Link
          href="/?tab=pipeline-intelligence"
          className="rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-xs text-teal-100"
        >
          Full pipeline view
        </Link>
      </div>

      {loading && !data ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-10 animate-pulse rounded bg-zinc-800/80" />
          ))}
        </div>
      ) : null}

      {error && !data ? <p className="mt-3 text-sm text-amber-200">{error}</p> : null}

      {data ? (
        <div className="mt-4 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Top bottlenecks</h3>
              {data.executive.topBottlenecks.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500">No active bottlenecks detected.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {data.executive.topBottlenecks.slice(0, 5).map((row) => (
                    <li
                      key={`${row.territoryLabel}-${row.stage}`}
                      className={["rounded-lg border px-3 py-2 text-sm", SEVERITY_STYLES[row.severity]].join(" ")}
                    >
                      <p className="font-medium">{row.territoryLabel}</p>
                      <p className="mt-0.5 text-xs opacity-90">
                        {row.stage} · {row.count} candidates · {row.severity}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Top bottleneck territories
              </h3>
              {data.executive.topBottleneckTerritories.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-500">No territory bottlenecks detected.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {data.executive.topBottleneckTerritories.map((row) => (
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

          <div className="grid gap-6 lg:grid-cols-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Best conversion</h3>
              <ul className="mt-2 space-y-2">
                {data.executive.bestConversionTerritories.slice(0, 3).map((row) => (
                  <li key={row.dmName} className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm">
                    <p className="font-medium text-zinc-100">{row.territoryLabel}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{row.conversionPct}%</p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Worst conversion</h3>
              <ul className="mt-2 space-y-2">
                {data.executive.worstConversionTerritories.slice(0, 3).map((row) => (
                  <li key={row.dmName} className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm">
                    <p className="font-medium text-zinc-100">{row.territoryLabel}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{row.conversionPct}%</p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Fastest to MEL</h3>
              <ul className="mt-2 space-y-2">
                {data.executive.fastestTimeToMel.slice(0, 3).map((row) => (
                  <li key={row.dmName} className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm">
                    <p className="font-medium text-zinc-100">{row.territoryLabel}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{row.avgDaysToMel}d avg</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {data.executive.recruitersNeedingHelp.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Recruiters needing help</h3>
              <ul className="mt-2 flex flex-wrap gap-2">
                {data.executive.recruitersNeedingHelp.slice(0, 4).map((row) => (
                  <li
                    key={row.recruiter}
                    className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-100"
                  >
                    {row.recruiter} · {row.candidatesWaiting} waiting
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {data.slaTracking.some((row) => row.severity !== "normal" && row.beyondSlaCount > 0) ? (
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">SLA alerts</h3>
              <ul className="mt-2 space-y-1">
                {data.slaTracking
                  .filter((row) => row.beyondSlaCount > 0)
                  .map((row) => (
                    <li key={row.stage} className="text-xs text-amber-200">
                      {row.label}: {row.beyondSlaCount} beyond SLA ({row.severity})
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-800/80 pt-4">
        <Link href={pipelineQueueHref("needs-review")} className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:bg-zinc-800">
          Needs Review queue
        </Link>
        <Link href={pipelineQueueHref("needs-follow-up")} className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:bg-zinc-800">
          Contact Today
        </Link>
        <Link href="/?tab=executive-accountability" className="rounded-full border border-teal-500/30 px-3 py-1 text-xs text-teal-200 hover:bg-teal-500/10">
          Accountability actions
        </Link>
      </div>
    </section>
  );
}
