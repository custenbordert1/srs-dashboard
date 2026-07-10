"use client";

import { ExecutiveCard, ExecutiveButton, MetricCard, SectionHeader } from "@/components/executive/ui";
import { useAutonomousRecruitingOrchestrator } from "@/hooks/use-autonomous-recruiting-orchestrator";

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function AutonomousOperationsPanel() {
  const {
    status,
    enabled,
    loading,
    refreshing,
    acting,
    error,
    lastExecution,
    refresh,
    runDryRun,
    runLive,
  } = useAutonomousRecruitingOrchestrator();

  const execution = lastExecution ?? null;

  return (
    <ExecutiveCard>
      <SectionHeader
        title="Autonomous operations"
        subtitle="P148 recruiting orchestrator — coordinates P143–P147 on a schedule, disabled by default."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExecutiveButton onClick={() => runDryRun()} disabled={acting}>
              {acting ? "Running…" : "Dry run cycle"}
            </ExecutiveButton>
            {enabled ? (
              <ExecutiveButton onClick={() => runLive()} disabled={acting}>
                Run live cycle
              </ExecutiveButton>
            ) : null}
            <ExecutiveButton onClick={() => refresh()} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </ExecutiveButton>
          </div>
        }
      />

      <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
        Orchestrator is {enabled ? "ENABLED" : "DISABLED"} (AUTONOMOUS_RECRUITING_ENABLED). P146 and P147
        auto-send flags are respected independently. No Breezy writes from orchestrator.
      </p>

      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}

      {status?.alerts && status.alerts.length > 0 ? (
        <div className="mt-3 space-y-1">
          {status.alerts.map((alert) => (
            <p
              key={alert.id}
              className={`rounded px-3 py-1.5 text-xs ${
                alert.severity === "critical"
                  ? "border border-red-500/30 bg-red-500/10 text-red-200"
                  : "border border-amber-500/30 bg-amber-500/10 text-amber-100"
              }`}
            >
              {alert.message}: {alert.detail}
            </p>
          ))}
        </div>
      ) : null}

      {loading && !status ? (
        <p className="mt-4 text-sm text-zinc-500">Loading autonomous operations…</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Automation status"
            value={status?.automationStatus ?? "stopped"}
          />
          <MetricCard
            label="Last successful run"
            value={formatTimestamp(status?.lastSuccessfulRun)}
          />
          <MetricCard
            label="Run duration"
            value={status?.lastRunDurationMs != null ? `${status.lastRunDurationMs}ms` : "—"}
          />
          <MetricCard label="Candidates evaluated" value={status?.candidatesEvaluated ?? 0} />
          <MetricCard label="Paperwork queue" value={status?.paperworkQueueCount ?? 0} />
          <MetricCard label="Reminders sent" value={status?.remindersSent ?? 0} />
          <MetricCard label="Initial paperwork sent" value={status?.initialPaperworkSent ?? 0} />
          <MetricCard label="Blocked candidates" value={status?.blockedCandidates ?? 0} />
          <MetricCard label="Failures" value={status?.failures.length ?? 0} />
          <MetricCard label="Warnings" value={status?.warnings.length ?? 0} />
          <MetricCard label="Dry run only" value={status?.dryRunOnly ? "Yes" : "No"} />
          <MetricCard
            label="Next scheduled run"
            value={formatTimestamp(status?.nextScheduledRun)}
          />
        </div>
      )}

      {status?.currentRun ? (
        <div className="mt-4 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-100">
          Current run: {status.currentRun.runId.slice(0, 8)}… phase{" "}
          {status.currentRun.currentPhase ?? "starting"} ({status.currentRun.dryRun ? "dry run" : "live"})
        </div>
      ) : null}

      {execution ? (
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-400">
          Last execution: {execution.dryRun ? "dry run" : "live"} in {execution.durationMs}ms — evaluated{" "}
          {execution.candidatesEvaluated}, queue {execution.paperworkQueueCount}, reminders{" "}
          {execution.remindersSent}, initial {execution.initialPaperworkSent}
          {execution.skipped ? ` (skipped: ${execution.skipReason})` : ""}
        </div>
      ) : null}
    </ExecutiveCard>
  );
}
