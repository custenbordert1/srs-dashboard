"use client";

import { ExecutiveCard, ExecutiveButton, MetricCard, SectionHeader } from "@/components/executive/ui";
import { useControlledPaperworkAutomation } from "@/hooks/use-controlled-paperwork-automation";

export function AutoSendPaperworkReminderPanel() {
  const {
    data,
    loading,
    refresh,
    refreshing,
    acting,
    runDryRun,
    runAutoSend,
    autoSendEnabled,
    lastExecution,
    error,
  } = useControlledPaperworkAutomation();

  const autoSend = data?.autoSend;

  return (
    <ExecutiveCard>
      <SectionHeader
        title="Auto-send paperwork reminders"
        subtitle="P146 controlled auto-send — Reminder #1 and #2 only. Initial paperwork remains approval-only."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExecutiveButton onClick={() => runDryRun()} disabled={acting}>
              {acting ? "Running…" : "Run dry run"}
            </ExecutiveButton>
            {autoSendEnabled ? (
              <ExecutiveButton onClick={() => runAutoSend()} disabled={acting}>
                Run auto-send now
              </ExecutiveButton>
            ) : null}
            <ExecutiveButton onClick={() => refresh()} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </ExecutiveButton>
          </div>
        }
      />

      <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
        Auto-send is {autoSendEnabled ? "ENABLED" : "DISABLED"} (P146_AUTO_SEND_PAPERWORK_REMINDERS_ENABLED).
        {!autoSendEnabled
          ? " Dry run only — no reminders will be sent until the env flag is enabled."
          : " Live sends require Run auto-send now and pass all safety checks."}
      </p>

      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}

      {loading && !data ? (
        <p className="mt-4 text-sm text-zinc-500">Loading auto-send status…</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Auto-send"
            value={autoSend?.autoSendEnabled ? "Enabled" : "Disabled"}
          />
          <MetricCard label="Eligible reminders" value={autoSend?.eligibleRemindersToday ?? 0} />
          <MetricCard label="Sent today" value={autoSend?.sentToday ?? 0} />
          <MetricCard label="Skipped" value={autoSend?.skipped ?? 0} />
          <MetricCard label="Blocked" value={autoSend?.blocked ?? 0} />
          <MetricCard label="Failures" value={autoSend?.failures ?? 0} />
          <MetricCard label="Cooldown blocked" value={autoSend?.cooldownBlocked ?? 0} />
          <MetricCard label="Manual review" value={autoSend?.manualReviewRequired ?? 0} />
          <MetricCard label="Success rate" value={`${autoSend?.reminderSuccessRate ?? 0}%`} />
          <MetricCard label="Still waiting" value={autoSend?.candidatesStillWaiting ?? 0} />
          <MetricCard label="Duplicates prevented" value={autoSend?.duplicatesPrevented ?? 0} />
        </div>
      )}

      {lastExecution ? (
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-400">
          Last run: {lastExecution.dryRun ? "dry run" : "live"} — eligible {lastExecution.eligibleCount},
          sent {lastExecution.sentCount}, blocked {lastExecution.blockedCount}, failed {lastExecution.failedCount}
        </div>
      ) : null}
    </ExecutiveCard>
  );
}
