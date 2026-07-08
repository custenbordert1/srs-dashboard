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
import { useExecutiveApproval } from "@/hooks/use-executive-approval";
import { useExecutiveDecisionCenter } from "@/hooks/use-executive-decision-center";
import { gradeTone } from "@/lib/p168.1-executive-decision-center/compute-decision-score";

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

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function displayAction(action: string): string {
  return action.replace(/_/g, " ");
}

function recommendationTone(
  action: string,
): "success" | "warning" | "critical" | "neutral" {
  if (action === "RUN_NEXT_BATCH") return "success";
  if (action === "NO_ACTION_REQUIRED") return "neutral";
  if (action === "HOLD_INVESTIGATION") return "critical";
  return "warning";
}

export function ExecutiveDecisionCenter() {
  const {
    view,
    error,
    loading,
    loadingCeilingHit,
    showingCachedSnapshot,
    meta,
    refresh: refreshView,
  } = useExecutiveDecisionCenter();

  const {
    actionBusy,
    actionMessage,
    actionError,
    approve,
    dismiss,
    refresh: refreshApproval,
  } = useExecutiveApproval();

  const refreshAll = () => {
    void refreshView();
    void refreshApproval();
  };

  if (loading) {
    return <SectionLoadingCard title="Executive Decision Center" badge="P168.1" />;
  }

  if (loadingCeilingHit && !view) {
    return (
      <SectionErrorCard
        title="Executive Decision Center"
        badge="P168.1"
        message="Decision center timed out loading operational state."
        onRetry={refreshAll}
      />
    );
  }

  if (!view) {
    return (
      <SectionErrorCard
        title="Executive Decision Center"
        badge="P168.1"
        message={error ?? "Failed to load decision center"}
        onRetry={refreshAll}
      />
    );
  }

  const r = view.recommendation;
  const canApprove =
    r.action === "RUN_NEXT_BATCH" && view.blocking.approveDisabledReason == null && !actionBusy;

  return (
    <div className="space-y-6">
      {(showingCachedSnapshot || error) && (
        <SectionDegradedBanner
          stale={showingCachedSnapshot}
          message={error ?? "Showing cached decision center snapshot."}
          onRetry={refreshAll}
        />
      )}

      <ExecutiveCard id="p1681-executive-decision-center" variant="premium">
        <SectionHeader
          title="Executive Decision Center"
          subtitle="Unified operating state, recommendation, and approval — manual operator control only"
          badge="P168.1"
          actions={
            <LastUpdatedBadge
              at={view.generatedAt}
              stale={showingCachedSnapshot}
              ageSeconds={meta?.ageSeconds ?? null}
              refreshing={meta?.refreshing}
            />
          }
        />

        {/* SECTION 1 — SYSTEM STATUS */}
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          System status
        </h3>
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <MetricCard
            label="Observation mode"
            value={view.systemStatus.observationMode ? "Active" : "Off"}
          />
          <MetricCard label="Runner status" value={view.systemStatus.runnerStatus} />
          <MetricCard
            label="Continuous mode"
            value={view.systemStatus.continuousMode ? "Enabled" : "Disabled"}
          />
          <MetricCard
            label="Daemon"
            value={view.systemStatus.daemonActive ? "Running" : "Stopped"}
          />
          <MetricCard
            label="Production readiness"
            value={view.systemStatus.productionReadinessScore ?? "—"}
          />
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Executive decision score</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-zinc-100">
                {view.systemStatus.decisionScore}
              </span>
              <StatusBadge tone={gradeTone(view.systemStatus.decisionGrade)}>
                {view.systemStatus.decisionGrade}
              </StatusBadge>
            </div>
          </div>
        </div>

        {/* SECTION 2 — CURRENT RECOMMENDATION */}
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Current recommendation
        </h3>
        <div className="mb-4 rounded-lg border border-zinc-700/60 bg-zinc-900/40 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={recommendationTone(r.action)}>{displayAction(r.action)}</StatusBadge>
            <span className="text-sm font-medium text-zinc-200">{r.title}</span>
            <span className="text-sm text-zinc-400">Confidence {r.confidence}%</span>
          </div>
          <p className="mt-2 text-sm text-zinc-300">{r.reason}</p>
        </div>
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-5">
          <MetricCard label="Expected sends" value={r.expectedSends} />
          <MetricCard label="Queue reduction" value={r.expectedQueueReduction} />
          <MetricCard label="Dropbox requests" value={r.projectedDropboxRequests} />
          <MetricCard label="Est. runtime" value={formatDuration(r.estimatedRuntimeMs)} />
          <MetricCard
            label="Scheduler"
            value={r.schedulerRecommendation.replace(/_/g, " ")}
          />
        </div>

        {/* SECTION 3 — BLOCKING FACTORS */}
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Blocking factors
        </h3>
        <div className="mb-4 grid gap-1 sm:grid-cols-2">
          {view.blocking.checklist.map((item) => (
            <div
              key={item.id}
              className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-sm ${
                item.pass ? "text-emerald-200/90" : "text-amber-200/90"
              }`}
            >
              <span aria-hidden>{item.pass ? "✓" : "✕"}</span>
              <span>
                {item.label}
                {!item.pass && item.detail ? (
                  <span className="block text-xs text-zinc-500">{item.detail}</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
        {(view.blocking.nextExpectedApprovalAt || view.blocking.actionRequiredBeforeApproval) && (
          <div className="mb-8 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">
            {view.blocking.nextExpectedApprovalAt && (
              <p>
                Next expected approval window:{" "}
                <strong>{formatTimestamp(view.blocking.nextExpectedApprovalAt)}</strong>
              </p>
            )}
            {view.blocking.actionRequiredBeforeApproval && (
              <p className={view.blocking.nextExpectedApprovalAt ? "mt-1" : ""}>
                Action required before approval: {view.blocking.actionRequiredBeforeApproval}
              </p>
            )}
          </div>
        )}

        {/* SECTION 4 — NEXT ACTION */}
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Next action
        </h3>
        {(actionMessage || actionError) && (
          <div
            className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
              actionError
                ? "border-rose-500/40 bg-rose-500/10 text-rose-100"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
            }`}
          >
            {actionError ?? actionMessage}
          </div>
        )}
        <div className="mb-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canApprove}
            title={view.blocking.approveDisabledReason ?? undefined}
            onClick={() => {
              if (
                !window.confirm(
                  `Approve and run next capped production batch?\n\nExpected sends: ${r.expectedSends}\nDropbox API: ~${r.projectedDropboxRequests}\n\nUses existing P159 manual live cycle (P154 → P152).`,
                )
              ) {
                return;
              }
              void approve().then(() => refreshAll());
            }}
            className={`rounded-md px-4 py-2 text-sm font-medium ${
              canApprove
                ? "bg-emerald-600 text-white hover:bg-emerald-500"
                : "cursor-not-allowed bg-zinc-800 text-zinc-500"
            }`}
          >
            {actionBusy ? "Running…" : "Approve Next Batch"}
          </button>
          <button
            type="button"
            disabled={actionBusy}
            onClick={refreshAll}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-600"
          >
            Refresh Recommendation
          </button>
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => void dismiss().then(() => refreshAll())}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-600"
          >
            Dismiss Recommendation
          </button>
        </div>
        {view.blocking.approveDisabledReason && (
          <p className="mb-8 text-xs text-zinc-500">
            Approve disabled: {view.blocking.approveDisabledReason}
          </p>
        )}
        {!view.blocking.approveDisabledReason && (
          <p className="mb-8 text-xs text-zinc-500">
            Manual operator approval only. Executes via P159 → P154 → P152 — no new send logic.
          </p>
        )}

        {/* SECTION 5 — LAST EXECUTION */}
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Last execution
        </h3>
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <MetricCard label="Last batch" value={formatTimestamp(view.lastExecution.at)} />
          <MetricCard label="Paperwork sent" value={view.lastExecution.paperworkSent ?? "—"} />
          <MetricCard label="Duration" value={formatDuration(view.lastExecution.durationMs)} />
          <MetricCard label="Dropbox API" value={view.lastExecution.dropboxRequests ?? "—"} />
          <MetricCard label="Errors" value={view.lastExecution.errors ?? "—"} />
          <MetricCard label="Queue reduction" value={view.lastExecution.queueReduction ?? "—"} />
        </div>

        {/* SECTION 6 — APPROVAL HISTORY */}
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Approval history
        </h3>
        {view.history.length === 0 ? (
          <p className="text-sm text-zinc-500">No approval actions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-2 py-2">Time</th>
                  <th className="px-2 py-2">Executive</th>
                  <th className="px-2 py-2">Recommendation</th>
                  <th className="px-2 py-2">Result</th>
                  <th className="px-2 py-2">Sent</th>
                  <th className="px-2 py-2">Duration</th>
                  <th className="px-2 py-2">Errors</th>
                </tr>
              </thead>
              <tbody>
                {view.history.map((row) => (
                  <tr key={row.id} className="border-b border-zinc-800/60 text-zinc-300">
                    <td className="px-2 py-2">{formatTimestamp(row.at)}</td>
                    <td className="px-2 py-2">{row.executive}</td>
                    <td className="px-2 py-2">{row.recommendation}</td>
                    <td className="px-2 py-2">{row.result ?? "—"}</td>
                    <td className="px-2 py-2">{row.paperworkSent ?? "—"}</td>
                    <td className="px-2 py-2">{formatDuration(row.durationMs)}</td>
                    <td className="px-2 py-2">{row.errors ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ExecutiveCard>
    </div>
  );
}
