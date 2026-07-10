"use client";

import Link from "next/link";
import { ExecutiveApiDegradedState } from "@/components/executive/executive-tab-loading-fallback";
import { usePipelineIntelligence } from "@/hooks/use-pipeline-intelligence";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import { pipelineQueueHref } from "@/lib/pipeline-intelligence/client";
import type { BottleneckSeverity, FunnelConversionTrend } from "@/lib/pipeline-intelligence/client";
import type { ReactNode } from "react";

const SEVERITY_STYLES: Record<BottleneckSeverity, string> = {
  normal: "text-zinc-400",
  warning: "text-amber-200",
  high: "text-orange-200",
  critical: "text-red-200",
};

const TREND_LABELS: Record<FunnelConversionTrend, string> = {
  up: "↑ Improving",
  down: "↓ Declining",
  flat: "→ Stable",
};

function SeverityBadge({ severity }: { severity: BottleneckSeverity }) {
  if (severity === "normal") return <span className="text-zinc-500">Normal</span>;
  return (
    <span className={["text-xs font-medium uppercase", SEVERITY_STYLES[severity]].join(" ")}>
      {severity}
    </span>
  );
}

function RankingList({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      {children ?? <p className="mt-2 text-sm text-zinc-500">{empty}</p>}
    </div>
  );
}

type PipelineIntelligencePanelProps = {
  compact?: boolean;
};

export function PipelineIntelligencePanel({ compact = false }: PipelineIntelligencePanelProps) {
  const { data, loading, error, refresh, showingCachedSnapshot, meta, refreshing } =
    usePipelineIntelligence();
  const loadingCeilingHit = useLoadingCeiling(loading && !data, EXECUTIVE_PANEL_LOADING_CEILING_MS);
  const showLoading = loading && !data && !loadingCeilingHit;

  if (showLoading) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-800/80" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-10 animate-pulse rounded bg-zinc-800/60" />
          ))}
        </div>
      </section>
    );
  }

  if ((error || loadingCeilingHit) && !data) {
    return (
      <ExecutiveApiDegradedState
        source="pipeline-intelligence"
        message={
          error ??
          "Pipeline intelligence is still loading. Retry shortly."
        }
        onRetry={() => refresh()}
        retrying={refreshing}
        timedOut={loadingCeilingHit}
        showingCachedSnapshot={showingCachedSnapshot}
      />
    );
  }

  if (!data) {
    return (
      <ExecutiveApiDegradedState
        source="pipeline-intelligence"
        message="Pipeline intelligence is still loading. Retry shortly."
        onRetry={() => refresh()}
        retrying={refreshing}
      />
    );
  }

  return (
    <div className="space-y-6">
      {(showingCachedSnapshot || meta?.partialSync || refreshing) && (
        <p className="text-xs text-amber-200/90">
          {showingCachedSnapshot
            ? "Showing last loaded pipeline snapshot."
            : meta?.partialSync
              ? "Partial sync — funnel metrics update as Breezy cache fills."
              : "Refreshing pipeline intelligence…"}
        </p>
      )}
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Pipeline Intelligence</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          True stage-to-stage conversion, SLA tracking, territory rankings, and recruiter performance from live
          Breezy candidates and local workflow overlay.
        </p>
      </header>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-50">Funnel conversion</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Progression rates based on candidates who reached each stage vs. the next stage.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">Transition</th>
                <th className="pb-2 pr-3 text-right">At stage</th>
                <th className="pb-2 pr-3 text-right">Conversion %</th>
                <th className="pb-2">Trend (21d)</th>
              </tr>
            </thead>
            <tbody>
              {data.funnelTransitions.map((row) => (
                <tr key={row.id} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 font-medium text-zinc-200">{row.label}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-zinc-300">{row.count}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-zinc-300">
                    {row.conversionPct !== null ? `${row.conversionPct}%` : "—"}
                  </td>
                  <td className="py-2 text-xs text-zinc-400">{TREND_LABELS[row.trend]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-50">SLA tracking</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[880px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">SLA</th>
                <th className="pb-2 pr-3 text-right">Count</th>
                <th className="pb-2 pr-3 text-right">Beyond SLA</th>
                <th className="pb-2 pr-3">Severity</th>
                <th className="pb-2">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {data.slaTracking.map((row) => (
                <tr key={row.stage} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 font-medium text-zinc-200">{row.label}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{row.count}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-amber-200">{row.beyondSlaCount}</td>
                  <td className="py-2 pr-3">
                    <SeverityBadge severity={row.severity} />
                  </td>
                  <td className="py-2 text-xs text-zinc-400">{row.recommendation ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-50">Candidate pipeline by stage</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[640px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">Stage</th>
                <th className="pb-2 pr-3 text-right">Count</th>
                <th className="pb-2 pr-3 text-right">Funnel conv %</th>
                <th className="pb-2 pr-3 text-right">Avg days</th>
                <th className="pb-2">Bottleneck</th>
              </tr>
            </thead>
            <tbody>
              {data.stages.map((row) => (
                <tr key={row.stage} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 font-medium text-zinc-200">{row.stage}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-zinc-300">{row.count}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-zinc-300">
                    {row.conversionToNextPct !== null ? `${row.conversionToNextPct}%` : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-zinc-300">
                    {row.avgDaysInStage ?? "—"}
                  </td>
                  <td className="py-2">
                    <SeverityBadge severity={row.bottleneckSeverity} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {!compact ? (
        <>
          <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-zinc-50">Executive territory rankings</h2>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <RankingList
                title="Top bottleneck territories"
                empty="No territory bottlenecks detected."
              >
                {data.executive.topBottleneckTerritories.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {data.executive.topBottleneckTerritories.map((row) => (
                      <li key={row.dmName} className="text-sm text-zinc-300">
                        <p className="font-medium text-zinc-100">{row.territoryLabel}</p>
                        <p className="mt-0.5 text-xs text-amber-200">
                          {row.bottleneck.stage} · {row.bottleneck.count} · {row.bottleneck.severity}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </RankingList>

              <RankingList title="Worst conversion territories" empty="No territory conversion data yet.">
                {data.executive.worstConversionTerritories.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {data.executive.worstConversionTerritories.map((row) => (
                      <li key={row.dmName} className="text-sm text-zinc-300">
                        <p className="font-medium text-zinc-100">{row.territoryLabel}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">{row.conversionPct}% to Active Rep</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </RankingList>

              <RankingList title="Best conversion territories" empty="No territory conversion data yet.">
                {data.executive.bestConversionTerritories.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {data.executive.bestConversionTerritories.map((row) => (
                      <li key={row.dmName} className="text-sm text-zinc-300">
                        <p className="font-medium text-zinc-100">{row.territoryLabel}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {row.conversionPct}% · {row.avgDaysToMel !== null ? `${row.avgDaysToMel}d to MEL` : "—"}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </RankingList>

              <RankingList title="Fastest time to MEL" empty="No MEL timing data yet.">
                {data.executive.fastestTimeToMel.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {data.executive.fastestTimeToMel.map((row) => (
                      <li key={row.dmName} className="text-sm text-zinc-300">
                        <p className="font-medium text-zinc-100">{row.territoryLabel}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">{row.avgDaysToMel}d avg · {row.conversionPct}% conv</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </RankingList>
            </div>

            <div className="mt-4">
              <RankingList title="Recruiters needing help" empty="No recruiters with SLA backlog.">
                {data.executive.recruitersNeedingHelp.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {data.executive.recruitersNeedingHelp.map((row) => (
                      <li key={row.recruiter} className="text-sm text-zinc-300">
                        <p className="font-medium text-zinc-100">{row.recruiter}</p>
                        <p className="mt-0.5 text-xs text-amber-200">
                          {row.candidatesWaiting} waiting · {row.conversionPct}% conv ·{" "}
                          {row.avgResponseDays !== null ? `${row.avgResponseDays}d response` : "—"}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </RankingList>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-zinc-50">Territory recruiting funnels</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Territories grouped by DM and state coverage (city labels are not available in ATS data).
            </p>
            <div className="mt-3 space-y-4">
              {data.territories
                .filter((territory) => territory.totalActive > 0)
                .slice(0, 8)
                .map((territory) => (
                  <div key={territory.dmName} className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-zinc-100">{territory.territoryLabel}</p>
                      <p className="text-xs text-zinc-500">{territory.totalActive} active</p>
                    </div>
                    {territory.topBottleneck ? (
                      <p className="mt-1 text-xs text-amber-200">
                        Bottleneck: {territory.topBottleneck.stage} ({territory.topBottleneck.severity})
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {territory.stages
                        .filter((stage) => stage.count > 0)
                        .map((stage) => (
                          <span
                            key={stage.stage}
                            className="rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400"
                          >
                            {stage.stage}: {stage.count}
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-zinc-50">Recruiter performance</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-[960px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                    <th className="pb-2 pr-3">Recruiter</th>
                    <th className="pb-2 pr-3 text-right">Assigned</th>
                    <th className="pb-2 pr-3 text-right">Reviewed</th>
                    <th className="pb-2 pr-3 text-right">Contacted</th>
                    <th className="pb-2 pr-3 text-right">Interviews</th>
                    <th className="pb-2 pr-3 text-right">Paperwork</th>
                    <th className="pb-2 pr-3 text-right">MEL ready</th>
                    <th className="pb-2 pr-3 text-right">Conv %</th>
                    <th className="pb-2 pr-3 text-right">Avg response</th>
                    <th className="pb-2 text-right">Waiting</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recruiters.slice(0, 20).map((row) => (
                    <tr key={row.recruiter} className="border-b border-zinc-800/60">
                      <td className="py-2 pr-3 font-medium text-zinc-200">{row.recruiter}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.assigned}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.reviewed}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.contacted}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.interviewsScheduled}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.paperworkSent}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.readyForMel}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.conversionPct}%</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {row.avgResponseDays !== null ? `${row.avgResponseDays}d` : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-amber-200">{row.candidatesWaiting}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
            <h2 className="text-lg font-semibold text-zinc-50">Candidate aging</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              {data.aging.map((bucket) => (
                <div key={bucket.bucket} className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2">
                  <p className="text-xs uppercase text-zinc-500">{bucket.bucket} days</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-50">{bucket.count}</p>
                  <p className="mt-1 text-xs text-amber-200">{bucket.beyondSlaCount} beyond SLA</p>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-50">Action center queues</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={pipelineQueueHref("needs-review")} className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800">
            Needs Review
          </Link>
          <Link href={pipelineQueueHref("needs-follow-up")} className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800">
            Contact Today
          </Link>
          <Link href={pipelineQueueHref("interview-needed")} className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800">
            Interview Needed
          </Link>
          <Link href={pipelineQueueHref("paperwork-pending")} className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800">
            Paperwork Pending
          </Link>
          <Link href={pipelineQueueHref("ready-mel")} className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800">
            Ready For MEL
          </Link>
        </div>
      </section>
    </div>
  );
}
