"use client";

import {
  ExecutiveButton,
  ExecutiveCard,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import { useCandidatePipelineAdvancement } from "@/hooks/use-candidate-pipeline-advancement";

export function CandidatePipelineAdvancementPanel() {
  const { report, meta, loading, refreshing, executing, error, refresh, executeLive } =
    useCandidatePipelineAdvancement();

  const flow = report?.dashboard.pipelineFlow;
  const topBlockers = report?.topBlockerCounts.slice(0, 8) ?? [];

  return (
    <ExecutiveCard>
      <SectionHeader
        title="Candidate pipeline advancement"
        subtitle="P151 — autonomous recruiter assignment and workflow advancement (disabled by default)."
        actions={
          <div className="flex gap-2">
            <ExecutiveButton onClick={() => refresh()} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </ExecutiveButton>
            {meta?.p151Enabled ? (
              <ExecutiveButton onClick={() => executeLive()} disabled={executing}>
                {executing ? "Running…" : "Run live cycle"}
              </ExecutiveButton>
            ) : null}
          </div>
        }
      />

      <p className="mt-2 text-xs text-zinc-400">
        P151_AUTONOMOUS_ADVANCEMENT_ENABLED={meta?.p151Enabled ? "true" : "false"} —{" "}
        {report?.dryRun !== false ? "dry run only" : "live execution enabled"}.
      </p>

      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}

      {loading && !report ? (
        <p className="mt-4 text-sm text-zinc-500">Loading pipeline advancement…</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Waiting assignment"
              value={report?.dashboard.candidatesWaitingAssignment ?? 0}
            />
            <MetricCard label="Advanced today" value={report?.dashboard.candidatesAdvancedToday ?? 0} />
            <MetricCard
              label="Assignments today"
              value={report?.dashboard.assignmentsCompletedToday ?? 0}
            />
            <MetricCard label="Blocked" value={report?.dashboard.blockedCandidates ?? 0} />
            <MetricCard label="Readiness score" value={`${report?.readinessScore ?? 0}/100`} />
            <MetricCard
              label="Eligible assignment"
              value={report?.candidatesEligibleForAssignment ?? 0}
            />
            <MetricCard
              label="Eligible advancement"
              value={report?.candidatesEligibleForAdvancement ?? 0}
            />
            <MetricCard label="Evaluated" value={report?.candidatesEvaluated ?? 0} />
          </div>

          {flow ? (
            <div className="mt-6">
              <SectionHeader title="Pipeline flow" subtitle="Candidates by dashboard stage category." />
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(flow)
                  .sort((a, b) => b[1] - a[1])
                  .map(([stage, count]) => (
                    <div
                      key={stage}
                      className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm"
                    >
                      <span className="text-zinc-300">{stage}</span>
                      <span className="tabular-nums font-medium text-zinc-100">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}

          {topBlockers.length > 0 ? (
            <div className="mt-6">
              <SectionHeader title="Top blockers" />
              <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                {topBlockers.map((item) => (
                  <li key={item.blocker} className="flex justify-between gap-4">
                    <span>{item.blocker}</span>
                    <span className="tabular-nums text-zinc-400">{item.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {report?.dashboard.averageTimeInStageHours &&
          Object.keys(report.dashboard.averageTimeInStageHours).length > 0 ? (
            <div className="mt-6">
              <SectionHeader title="Average time in stage" subtitle="Hours since applied (by workflow status)." />
              <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                {Object.entries(report.dashboard.averageTimeInStageHours)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 8)
                  .map(([status, hours]) => (
                    <li key={status} className="flex justify-between gap-4">
                      <span>{status}</span>
                      <span className="tabular-nums text-zinc-400">{hours}h</span>
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </ExecutiveCard>
  );
}
