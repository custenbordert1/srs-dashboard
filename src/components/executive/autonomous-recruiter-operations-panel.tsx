"use client";

import {
  LastUpdatedBadge,
  SectionDegradedBanner,
  SectionErrorCard,
  SectionLoadingCard,
} from "@/components/ui/loading-state";
import {
  ExecutiveCard,
  MetricCard,
  SectionHeader,
  StatusBadge,
} from "@/components/executive/ui";
import { useAutonomousOrchestrator } from "@/hooks/use-autonomous-orchestrator";
import { healthTone, statusTone } from "@/lib/p169-autonomous-recruiting-orchestrator/presentation";

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export function AutonomousRecruiterOperationsPanel() {
  const {
    console: ops,
    warnings,
    loading,
    error,
    actionBusy,
    actionMessage,
    refresh,
    pause,
    resume,
    runCycle,
  } = useAutonomousOrchestrator();

  if (loading) {
    return <SectionLoadingCard title="Autonomous Recruiter" badge="P169" />;
  }

  if (error || !ops) {
    return (
      <SectionErrorCard
        title="Autonomous Recruiter"
        badge="P169"
        message={error ?? "Operations console unavailable"}
        onRetry={() => void refresh()}
      />
    );
  }

  return (
    <ExecutiveCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader
          title="Autonomous Recruiter"
          subtitle="Operations console — monitors autonomous cycles; execution routes through P159 → P154 → P152"
          badge="P169"
        />
        <div className="flex flex-wrap items-center gap-2">
          <LastUpdatedBadge at={ops.generatedAt} />
          <StatusBadge tone={statusTone(ops.status)}>{ops.statusLabel}</StatusBadge>
          <StatusBadge tone={ops.health.label === "healthy" ? "success" : "warning"}>
            {`Health ${ops.health.score}`}
          </StatusBadge>
        </div>
      </div>

      {warnings.length > 0 ? (
        <div className="mt-4">
          <SectionDegradedBanner message={warnings.join(" · ")} />
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Last cycle" value={ops.lastCycle.agoLabel} hint={ops.lastCycle.at ?? undefined} />
        <MetricCard label="Next cycle" value={ops.nextCycle.inLabel} hint={ops.nextCycle.at ?? undefined} />
        <MetricCard label="Candidates evaluated" value={String(ops.metrics.candidatesEvaluated)} />
        <MetricCard label="Paperwork sent" value={String(ops.metrics.paperworkSent)} />
        <MetricCard label="Exceptions" value={String(ops.metrics.exceptions)} />
        <MetricCard label="Skipped" value={String(ops.metrics.skipped)} />
        <MetricCard label="Dropbox requests" value={String(ops.metrics.dropboxRequests ?? "—")} />
        <MetricCard label="Runner" value={ops.runner.status} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Scheduler</p>
          <p className="mt-2 text-sm text-zinc-200">{ops.scheduler.recommendation.replace(/_/g, " ")}</p>
          <p className="mt-3 text-xs text-zinc-500">
            Dropbox: {ops.dropbox.usedToday} / {ops.dropbox.currentBudget} today
            {ops.dropbox.withinBudget ? " · within budget" : " · budget risk"}
          </p>
          <p className={`mt-2 text-sm font-medium ${healthTone(ops.health.label)}`}>
            {ops.health.label.charAt(0).toUpperCase() + ops.health.label.slice(1)} ({ops.health.score})
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Configuration</p>
          <ul className="mt-2 space-y-1 text-xs text-zinc-400">
            <li>Cycle interval: {Math.round(ops.config.cycleIntervalMs / 60_000)} min</li>
            <li>Min confidence: {ops.config.minimumConfidence}</li>
            <li>Readiness threshold: {ops.config.readinessThreshold}</li>
            <li>Max retries: {ops.config.maximumRetries}</li>
            <li>Enabled: {ops.enabled ? "yes" : "no (env gate)"}</li>
          </ul>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={actionBusy || ops.paused}
          onClick={() => void pause()}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          Pause
        </button>
        <button
          type="button"
          disabled={actionBusy || !ops.paused}
          onClick={() => void resume()}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          Resume
        </button>
        <button
          type="button"
          disabled={actionBusy}
          onClick={() => void refresh()}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          Refresh
        </button>
        {actionMessage ? <p className="self-center text-xs text-zinc-400">{actionMessage}</p> : null}
      </div>

      {ops.recentCycles.length > 0 ? (
        <div className="mt-6 overflow-x-auto">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Recent cycles</p>
          <table className="w-full min-w-[640px] text-left text-xs text-zinc-300">
            <thead className="text-zinc-500">
              <tr>
                <th className="pb-2 pr-4">Cycle</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Evaluated</th>
                <th className="pb-2 pr-4">Sent</th>
                <th className="pb-2 pr-4">Duration</th>
              </tr>
            </thead>
            <tbody>
              {ops.recentCycles.slice(0, 5).map((row) => (
                <tr key={row.cycleId} className="border-t border-zinc-800/60">
                  <td className="py-2 pr-4 font-mono text-[10px]">{row.cycleId.slice(0, 12)}…</td>
                  <td className="py-2 pr-4">{row.status}</td>
                  <td className="py-2 pr-4 tabular-nums">{row.candidatesEvaluated}</td>
                  <td className="py-2 pr-4 tabular-nums">{row.candidatesSent}</td>
                  <td className="py-2 pr-4 tabular-nums">{formatDuration(row.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </ExecutiveCard>
  );
}
