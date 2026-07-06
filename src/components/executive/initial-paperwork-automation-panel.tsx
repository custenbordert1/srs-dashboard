"use client";

import { ExecutiveCard, ExecutiveButton, MetricCard, SectionHeader } from "@/components/executive/ui";
import { useControlledPaperworkAutomation } from "@/hooks/use-controlled-paperwork-automation";

export function InitialPaperworkAutomationPanel() {
  const {
    data,
    loading,
    refresh,
    refreshing,
    acting,
    runInitialDryRun,
    runInitialAutoSend,
    initialAutoSendEnabled,
    lastInitialExecution,
    error,
  } = useControlledPaperworkAutomation();

  const metrics = data?.initialPaperwork;

  return (
    <ExecutiveCard>
      <SectionHeader
        title="Initial paperwork automation"
        subtitle="P147 autonomous initial delivery — extremely conservative, disabled by default."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExecutiveButton onClick={() => runInitialDryRun()} disabled={acting}>
              {acting ? "Running…" : "Dry run"}
            </ExecutiveButton>
            {initialAutoSendEnabled ? (
              <ExecutiveButton onClick={() => runInitialAutoSend()} disabled={acting}>
                Auto send now
              </ExecutiveButton>
            ) : null}
            <ExecutiveButton onClick={() => refresh()} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </ExecutiveButton>
          </div>
        }
      />

      <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
        Auto-send is {initialAutoSendEnabled ? "ENABLED" : "DISABLED"} (P147_INITIAL_PAPERWORK_AUTO_SEND_ENABLED).
        Requires P144 Send Paperwork action, confidence ≥ 90%, zero blockers, and duplicate prevention.
      </p>

      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}

      {loading && !data ? (
        <p className="mt-4 text-sm text-zinc-500">Loading initial paperwork automation…</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Eligible" value={metrics?.eligibleCandidates ?? 0} />
          <MetricCard label="Sent today" value={metrics?.initialPaperworkSentToday ?? 0} />
          <MetricCard label="Blocked" value={metrics?.blockedCandidates ?? 0} />
          <MetricCard label="Failed" value={data?.lastInitialPaperworkSummary?.failedCount ?? 0} />
          <MetricCard label="Duplicates prevented" value={metrics?.duplicatesPrevented ?? 0} />
          <MetricCard label="Success rate" value={`${metrics?.executionSuccessRate ?? 0}%`} />
          <MetricCard
            label="Avg time to paperwork"
            value={`${metrics?.averageTimeToPaperworkHours ?? 0}h`}
          />
          <MetricCard
            label="Auto-send"
            value={metrics?.autoSendEnabled ? "Enabled" : "Disabled"}
          />
        </div>
      )}

      {lastInitialExecution ? (
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-400">
          Last execution: {lastInitialExecution.dryRun ? "dry run" : "live"} in{" "}
          {lastInitialExecution.executionTimeMs}ms — eligible {lastInitialExecution.eligibleCount}, sent{" "}
          {lastInitialExecution.sentCount}, blocked {lastInitialExecution.blockedCount}
        </div>
      ) : null}
    </ExecutiveCard>
  );
}
