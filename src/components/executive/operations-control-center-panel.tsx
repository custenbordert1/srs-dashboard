"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  ExecutiveWarningList,
  MetricCard,
  SectionHeader,
  StatusBadge,
} from "@/components/executive/ui";
import { useOperationsControlCenter } from "@/hooks/use-operations-control-center";
import type { P159Recommendation, P159SystemMode } from "@/lib/p159-operations-control-center/types";

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatUptime(ms: number | null): string {
  if (ms == null) return "—";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function modeTone(mode: P159SystemMode): "success" | "warning" | "neutral" | "critical" {
  if (mode === "ready" || mode === "running") return "success";
  if (mode === "manual_only" || mode === "degraded") return "warning";
  if (mode === "blocked" || mode === "paused") return "critical";
  return "neutral";
}

const MODE_LABELS: Record<P159SystemMode, string> = {
  manual_only: "Manual only",
  paused: "Paused",
  ready: "Ready",
  running: "Running",
  blocked: "Blocked",
  degraded: "Degraded",
};

const RECOMMENDATION_LABELS: Record<P159Recommendation, string> = {
  continue_manual_batches: "Continue manual batches",
  safe_for_capped_cycle: "Safe to run another capped cycle",
  pause_due_to_failures: "Pause due to failures",
  ready_for_server_deployment: "Ready for server deployment",
  ready_for_continuous_observation: "Ready for continuous mode observation",
  not_ready_for_autonomous_sending: "Not ready for autonomous sending",
};

export function OperationsControlCenterPanel() {
  const {
    dashboard,
    warnings,
    error,
    loading,
    loadingCeilingHit,
    showingCachedSnapshot,
    actionBusy,
    actionMessage,
    actionError,
    refresh,
    postControl,
  } = useOperationsControlCenter();

  if (loading) {
    return <ExecutivePanelLoading title="Operations Control Center" badge="P159" />;
  }

  if (loadingCeilingHit && !dashboard) {
    return (
      <ExecutivePanelError
        title="Operations Control Center"
        message="Dashboard timed out. Classification may still be running — retry shortly."
        onRetry={() => void refresh(true)}
      />
    );
  }

  if (!dashboard) {
    return (
      <ExecutivePanelError
        title="Operations Control Center"
        message={error ?? "Failed to load operations control center"}
        onRetry={() => void refresh(true)}
      />
    );
  }

  const r = dashboard.runner;
  const t = dashboard.today;
  const q = dashboard.queue;
  const bannerWarnings = [...warnings, ...(error ? [error] : [])];

  return (
    <div className="space-y-6">
      {(showingCachedSnapshot || bannerWarnings.length > 0) && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {showingCachedSnapshot ? (
            <p className="font-medium">Showing last successful dashboard snapshot.</p>
          ) : null}
          {bannerWarnings.length > 0 ? <ExecutiveWarningList warnings={bannerWarnings} /> : null}
        </div>
      )}

      <ExecutiveCard id="p159-recommendation" variant="premium">
        <SectionHeader
          title="Recommendation"
          subtitle="Single operator guidance based on current production state"
          badge="P159"
        />
        <div className="mb-3 flex flex-wrap gap-2">
          <StatusBadge tone={modeTone(r.systemMode)}>{MODE_LABELS[r.systemMode]}</StatusBadge>
          <StatusBadge tone="neutral">
            {RECOMMENDATION_LABELS[dashboard.recommendation]}
          </StatusBadge>
        </div>
        <p className="text-sm text-zinc-300">{dashboard.recommendationDetail}</p>
      </ExecutiveCard>

      <ExecutiveCard id="p159-runner-status">
        <SectionHeader title="Runner Status" subtitle="Continuous daemon is display-only — not startable from UI" />
        <div className="mb-5 flex flex-wrap gap-2">
          <StatusBadge tone={modeTone(r.systemMode)}>{MODE_LABELS[r.systemMode]}</StatusBadge>
          <StatusBadge tone={r.continuousEnabled ? "warning" : "neutral"}>
            {`Continuous ${r.continuousEnabled ? "ON" : "OFF"}`}
          </StatusBadge>
          <StatusBadge tone={r.daemonRunning ? "success" : "neutral"}>
            {`Daemon ${r.daemonRunning ? "running" : "stopped"}`}
          </StatusBadge>
          <StatusBadge tone="neutral">{`Mode: ${r.schedulerMode}`}</StatusBadge>
          {r.processingLockHeld ? <StatusBadge tone="warning">Lock held</StatusBadge> : null}
          {r.staleLockWarning ? <StatusBadge tone="critical">Stale lock</StatusBadge> : null}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="Last cycle" value={formatTimestamp(r.lastCycleAt)} />
          <MetricCard label="Next cycle" value={formatTimestamp(r.nextCycleAt)} />
          <MetricCard label="Interval" value={`${r.intervalMinutes} min`} />
          <MetricCard label="Uptime" value={formatUptime(r.uptimeMs)} />
          <MetricCard label="Send cap" value={String(r.maxSendsPerCycle)} />
          <MetricCard label="Assignment cap" value={String(r.maxAssignmentsPerCycle)} />
          <MetricCard
            label="Lock age"
            value={r.lockAgeMs != null ? `${Math.round(r.lockAgeMs / 1000)}s` : "—"}
          />
          <MetricCard label="Autopilot" value={r.autopilotEnabled ? "enabled" : "disabled"} />
        </div>
        {r.lastError ? <p className="mt-4 text-sm text-amber-300">Last error: {r.lastError}</p> : null}
      </ExecutiveCard>

      <ExecutiveCard id="p159-today-activity">
        <SectionHeader title="Today's Production Activity" subtitle="Audit + workflow cross-check" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="Paperwork sent" value={t.paperworkSent.toLocaleString()} />
          <MetricCard label="Send batches" value={t.sendBatchCount.toLocaleString()} />
          <MetricCard label="Signed today" value={t.signedToday.toLocaleString()} />
          <MetricCard label="Viewed today" value={t.viewedToday.toLocaleString()} />
          <MetricCard label="Pending signatures" value={t.pendingSignatures.toLocaleString()} />
          <MetricCard label="Duplicates prevented" value={t.duplicatesPrevented.toLocaleString()} />
          <MetricCard label="Failures" value={t.failures.toLocaleString()} />
        </div>
        {t.sendBatches.length > 0 ? (
          <ul className="mt-4 space-y-1 text-sm text-zinc-400">
            {t.sendBatches.map((batch) => (
              <li key={batch.batchNumber}>
                Batch {batch.batchNumber}: {batch.sendCount} sends — {formatTimestamp(batch.startAt)}{" "}
                → {formatTimestamp(batch.endAt)}
              </li>
            ))}
          </ul>
        ) : null}
      </ExecutiveCard>

      <ExecutiveCard id="p159-queue-status">
        <SectionHeader title="Queue Status" subtitle="P152 classification with workflow snapshot" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="Evaluated" value={q.candidatesEvaluated.toLocaleString()} />
          <MetricCard label="Eligible now" value={q.eligibleNow.toLocaleString()} />
          <MetricCard label="After assignment" value={q.readyAfterRecruiterAssignment.toLocaleString()} />
          <MetricCard label="After transition" value={q.readyAfterWorkflowTransition.toLocaleString()} />
          <MetricCard label="Waiting signature" value={q.waitingOnSignature.toLocaleString()} />
          <MetricCard label="Already sent" value={q.alreadySent.toLocaleString()} />
          <MetricCard label="Already signed" value={q.alreadySigned.toLocaleString()} />
          <MetricCard label="Duplicates" value={q.duplicates.toLocaleString()} />
          <MetricCard label="Invalid email" value={q.invalidEmails.toLocaleString()} />
          <MetricCard label="Manual review" value={q.manualReview.toLocaleString()} />
          <MetricCard label="Blocked" value={q.blocked.toLocaleString()} />
          <MetricCard label="Queue remaining" value={q.queueRemaining.toLocaleString()} />
        </div>
      </ExecutiveCard>

      <ExecutiveCard id="p159-batch-history">
        <SectionHeader title="Batch History" subtitle="Manual script batches + runner cycles" />
        {dashboard.batchHistory.length === 0 ? (
          <p className="text-sm text-zinc-500">No batches recorded today.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-zinc-300">
              <thead className="text-xs uppercase text-zinc-500">
                <tr>
                  <th className="pb-2 pr-3">Source</th>
                  <th className="pb-2 pr-3">Trigger</th>
                  <th className="pb-2 pr-3">Start</th>
                  <th className="pb-2 pr-3">Sent</th>
                  <th className="pb-2 pr-3">Assigned</th>
                  <th className="pb-2 pr-3">Failures</th>
                  <th className="pb-2">Duration</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.batchHistory.slice(0, 15).map((batch) => (
                  <tr key={batch.id} className="border-t border-zinc-800/60">
                    <td className="py-2 pr-3">
                      {batch.sourceLabel}
                      {batch.dryRun ? " (dry)" : ""}
                    </td>
                    <td className="py-2 pr-3">{batch.trigger}</td>
                    <td className="py-2 pr-3">{formatTimestamp(batch.startAt)}</td>
                    <td className="py-2 pr-3">{batch.paperworkSent}</td>
                    <td className="py-2 pr-3">{batch.recruitersAssigned}</td>
                    <td className="py-2 pr-3">{batch.failures}</td>
                    <td className="py-2">{Math.round(batch.durationMs / 1000)}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ExecutiveCard>

      <ExecutiveCard id="p159-safety">
        <SectionHeader title="Safety Checks" subtitle="Production safeguards — all must remain active" />
        <div className="grid grid-cols-2 gap-2 text-sm text-zinc-300 md:grid-cols-3">
          {(
            [
              ["Duplicate protection", dashboard.safety.duplicateProtectionActive],
              ["Active signature protection", dashboard.safety.activeSignatureProtectionActive],
              ["Invalid email protection", dashboard.safety.invalidEmailProtectionActive],
              ["Already-sent protection", dashboard.safety.alreadySentProtectionActive],
              ["Breezy write protection", dashboard.safety.breezyWriteProtectionActive],
              ["Caps active", dashboard.safety.capsActive],
              ["Stop on error", dashboard.safety.stopOnErrorActive],
            ] as const
          ).map(([label, active]) => (
            <div key={label} className="flex items-center gap-2 rounded border border-zinc-800/60 px-3 py-2">
              <StatusBadge tone={active ? "success" : "critical"}>{active ? "ON" : "OFF"}</StatusBadge>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </ExecutiveCard>

      <ExecutiveCard id="p159-controls">
        <SectionHeader
          title="Controls"
          subtitle="Executive only — continuous mode enable is display-only"
        />
        <div className="mb-4 rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2 text-sm text-zinc-400">
          <p>
            Continuous mode:{" "}
            <strong className="text-zinc-200">
              {dashboard.continuousMode.enabled ? "enabled on host" : "disabled"}
            </strong>{" "}
            — UI enable blocked until executive sign-off.
          </p>
          <p className="mt-1">{dashboard.continuousMode.note}</p>
          <p className="mt-2 text-amber-200/90">
            Live cycle requires {dashboard.liveCycleGates.envFlagRequired}=true, confirmLive, and
            executive session. Cap: {dashboard.liveCycleGates.maxSendsPerCycle} sends/cycle.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
            disabled={actionBusy}
            onClick={() => void refresh(true)}
          >
            Refresh status
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
            disabled={actionBusy}
            onClick={() => void postControl("dry_cycle")}
          >
            Run dry cycle
          </button>
          <button
            type="button"
            className="rounded-md border border-amber-700/60 px-3 py-1.5 text-sm text-amber-200"
            disabled={actionBusy}
            onClick={() => {
              const cap = dashboard.liveCycleGates.maxSendsPerCycle;
              if (
                !window.confirm(
                  `Run one capped live cycle (max ${cap} sends)? Requires ${dashboard.liveCycleGates.envFlagRequired}=true on server.`,
                )
              ) {
                return;
              }
              void postControl("live_cycle", { confirmLive: true });
            }}
          >
            Run capped live cycle ({dashboard.liveCycleGates.maxSendsPerCycle})
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
            disabled={actionBusy}
            onClick={() => void postControl("pause")}
          >
            Pause runner
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
            disabled={actionBusy}
            onClick={() => void postControl("resume")}
          >
            Resume runner
          </button>
          <button
            type="button"
            className="rounded-md border border-red-800/60 px-3 py-1.5 text-sm text-red-300"
            disabled={actionBusy}
            onClick={() => {
              if (!window.confirm("Emergency stop — halt runner, clear locks, pause autopilot?")) return;
              void postControl("emergency_stop");
            }}
          >
            Emergency stop
          </button>
          <button
            type="button"
            className="cursor-not-allowed rounded-md border border-zinc-800 px-3 py-1.5 text-sm text-zinc-600"
            disabled
            title="Continuous mode cannot be enabled from UI yet"
          >
            Enable continuous (locked)
          </button>
        </div>
        {actionError ? <p className="mt-3 text-sm text-red-400">{actionError}</p> : null}
        {actionMessage ? <p className="mt-3 text-sm text-emerald-400">{actionMessage}</p> : null}
      </ExecutiveCard>
    </div>
  );
}
