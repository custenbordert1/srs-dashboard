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
import { useLifecycleManager } from "@/hooks/use-lifecycle-manager";
import {
  healthTone,
  lifecycleStateLabel,
  statusTone,
} from "@/lib/p171-autonomous-candidate-lifecycle-manager/presentation";

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export function AutonomousLifecycleOperationsPanel() {
  const {
    console: lifecycleConsole,
    warnings,
    loading,
    error,
    actionBusy,
    actionMessage,
    refresh,
    pause,
    resume,
    runCycle,
  } = useLifecycleManager();

  if (loading) {
    return <SectionLoadingCard title="Autonomous Lifecycle" badge="P171" />;
  }

  if (error || !lifecycleConsole) {
    return (
      <SectionErrorCard
        title="Autonomous Lifecycle"
        badge="P171"
        message={error ?? "Lifecycle console unavailable"}
        onRetry={() => void refresh()}
      />
    );
  }

  const ops = lifecycleConsole;

  return (
    <ExecutiveCard>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeader
          title="Autonomous Lifecycle"
          subtitle="End-to-end candidate lifecycle — P170 discovery → P157 evaluation → P169 gates → P159/P154/P152 execution"
          badge="P171"
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
        <MetricCard label="Processed today" value={String(ops.metrics.candidatesProcessedToday)} />
        <MetricCard label="Paperwork auto-sent" value={String(ops.metrics.paperworkAutomaticallySent)} />
        <MetricCard label="Ready for MEL" value={String(ops.metrics.readyForMel)} />
        <MetricCard label="Waiting signature" value={String(ops.metrics.waitingSignature)} />
        <MetricCard
          label="Avg completion"
          value={formatDuration(ops.metrics.averageCompletionTimeMs)}
        />
        <MetricCard label="Automation rate" value={`${ops.metrics.automationSuccessRate}%`} />
        <MetricCard label="Exception rate" value={`${ops.metrics.exceptionRate}%`} />
        <MetricCard
          label="Interventions saved"
          value={String(ops.metrics.recruiterInterventionsSaved)}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Last cycle</p>
          <p className="mt-2 text-sm text-zinc-200">{ops.lastCycle.agoLabel}</p>
          <ul className="mt-3 space-y-1 text-xs text-zinc-400">
            <li>Processed: {ops.lastCycle.candidatesProcessed}</li>
            <li>Paperwork sent: {ops.lastCycle.paperworkSent}</li>
            <li>Reminders: {ops.lastCycle.remindersSent}</li>
            <li>Ready for MEL: {ops.lastCycle.readyForMel}</li>
            <li>Waiting signature: {ops.lastCycle.waitingSignature}</li>
          </ul>
          <p className={`mt-3 text-sm font-medium ${healthTone(ops.health.label)}`}>
            {ops.health.label.charAt(0).toUpperCase() + ops.health.label.slice(1)} ({ops.health.score})
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Lifecycle state distribution
          </p>
          {ops.stateDistribution.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-500">No candidates tracked yet — run a cycle.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-xs text-zinc-400">
              {ops.stateDistribution.map((row) => (
                <li key={row.state} className="flex justify-between gap-2">
                  <span>{lifecycleStateLabel(row.state)}</span>
                  <span className="tabular-nums text-zinc-300">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-zinc-500">
            Next cycle: {ops.nextCycle.inLabel}
            {ops.nextCycle.at ? ` (${ops.nextCycle.at})` : ""}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={actionBusy || !ops.enabled}
          onClick={() => void runCycle()}
          className="rounded-lg border border-teal-500/40 bg-teal-500/15 px-3 py-1.5 text-xs font-medium text-teal-100 hover:bg-teal-500/25 disabled:opacity-50"
        >
          Run cycle
        </button>
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
          <table className="w-full min-w-[720px] text-left text-xs text-zinc-300">
            <thead className="text-zinc-500">
              <tr>
                <th className="pb-2 pr-4">Cycle</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Processed</th>
                <th className="pb-2 pr-4">Sent</th>
                <th className="pb-2 pr-4">Automation %</th>
                <th className="pb-2 pr-4">Duration</th>
              </tr>
            </thead>
            <tbody>
              {ops.recentCycles.slice(0, 5).map((row) => (
                <tr key={row.cycleId} className="border-t border-zinc-800/60">
                  <td className="py-2 pr-4 font-mono text-[10px]">{row.cycleId.slice(0, 12)}…</td>
                  <td className="py-2 pr-4">{row.status}</td>
                  <td className="py-2 pr-4 tabular-nums">{row.candidatesProcessed}</td>
                  <td className="py-2 pr-4 tabular-nums">{row.paperworkSent}</td>
                  <td className="py-2 pr-4 tabular-nums">{row.automationSuccessRate}%</td>
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
