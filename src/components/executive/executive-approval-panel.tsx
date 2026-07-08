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
import { actionLabel, riskTone } from "@/lib/p168-executive-approval/presentation";
import { useExecutiveApproval } from "@/hooks/use-executive-approval";

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

export function ExecutiveApprovalPanel() {
  const {
    report,
    error,
    loading,
    loadingCeilingHit,
    showingCachedSnapshot,
    meta,
    actionBusy,
    actionMessage,
    actionError,
    refresh,
    approve,
    dismiss,
  } = useExecutiveApproval();

  if (loading) {
    return <SectionLoadingCard title="Executive Approval Queue" badge="P168" />;
  }

  if (loadingCeilingHit && !report) {
    return (
      <SectionErrorCard
        title="Executive Approval Queue"
        badge="P168"
        message="Approval recommendation timed out."
        onRetry={() => void refresh()}
      />
    );
  }

  if (!report) {
    return (
      <SectionErrorCard
        title="Executive Approval Queue"
        badge="P168"
        message={error ?? "Failed to load approval queue"}
        onRetry={() => void refresh()}
      />
    );
  }

  const r = report.recommendation;
  const canApprove = r.action === "RUN_NEXT_BATCH" && !actionBusy;

  return (
    <div className="space-y-6">
      {(showingCachedSnapshot || error) && (
        <SectionDegradedBanner
          stale={showingCachedSnapshot}
          message={error ?? "Showing cached approval snapshot."}
          onRetry={() => void refresh()}
        />
      )}

      <ExecutiveCard id="p168-executive-approval" variant="premium">
        <SectionHeader
          title="Executive Approval Queue"
          subtitle="One recommended action — manual operator approval required"
          badge="P168"
          actions={
            <LastUpdatedBadge
              at={report.generatedAt}
              stale={showingCachedSnapshot}
              ageSeconds={meta?.ageSeconds ?? null}
              refreshing={meta?.refreshing}
            />
          }
        />

        <div className="mb-4 rounded-lg border border-zinc-700/60 bg-zinc-900/40 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={r.action === "RUN_NEXT_BATCH" ? "success" : riskTone(r.riskLevel)}>
              {actionLabel(r.action)}
            </StatusBadge>
            <span className="text-sm font-medium text-zinc-200">{r.title}</span>
            <span className="text-sm text-zinc-400">Confidence {r.confidence}%</span>
            <StatusBadge tone={riskTone(r.riskLevel)}>{`Risk: ${r.riskLevel}`}</StatusBadge>
          </div>
          <p className="mt-2 text-sm text-zinc-300">{r.reason}</p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="Expected sends" value={r.expectedSends} />
          <MetricCard label="Queue reduction" value={r.expectedQueueReduction} />
          <MetricCard label="Dropbox requests" value={r.expectedDropboxApiRequests} />
          <MetricCard label="Est. duration" value={formatDuration(r.estimatedDurationMs)} />
        </div>

        {r.blockingFactors.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Blocking factors
            </h3>
            <ul className="list-inside list-disc text-sm text-amber-200/90">
              {r.blockingFactors.map((factor) => (
                <li key={factor}>{factor}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="Last execution" value={formatTimestamp(report.lastExecution.at)} />
          <MetricCard label="Last sent" value={report.lastExecution.paperworkSent ?? "—"} />
          <MetricCard
            label="Last duration"
            value={formatDuration(report.lastExecution.durationMs)}
          />
          <MetricCard label="Last result" value={report.lastExecution.result ?? "—"} />
        </div>

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

        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canApprove}
            onClick={() => {
              if (
                !window.confirm(
                  `Approve and run next capped production batch?\n\nExpected sends: ${r.expectedSends}\nDropbox API: ~${r.expectedDropboxApiRequests}\n\nThis uses the existing P159 manual live cycle path.`,
                )
              ) {
                return;
              }
              void approve();
            }}
            className={`rounded-md px-4 py-2 text-sm font-medium ${
              canApprove
                ? "bg-emerald-600 text-white hover:bg-emerald-500"
                : "cursor-not-allowed bg-zinc-800 text-zinc-500"
            }`}
          >
            {actionBusy ? "Running…" : "Approve & Run Next Batch"}
          </button>
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => void dismiss()}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-600"
          >
            Dismiss
          </button>
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => void refresh()}
            className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:border-zinc-600"
          >
            Refresh Recommendation
          </button>
        </div>

        <p className="mb-4 text-xs text-zinc-500">
          Manual operator approval only. Continuous mode remains disabled. Executes via existing
          P159/P154 manual live cycle — no new send logic.
        </p>

        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Approval history
        </h3>
        {report.history.length === 0 ? (
          <p className="text-sm text-zinc-500">No approval actions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-2 py-2">Time</th>
                  <th className="px-2 py-2">Executive</th>
                  <th className="px-2 py-2">Action</th>
                  <th className="px-2 py-2">Approved</th>
                  <th className="px-2 py-2">Executed</th>
                  <th className="px-2 py-2">Result</th>
                  <th className="px-2 py-2">Sent</th>
                  <th className="px-2 py-2">API</th>
                  <th className="px-2 py-2">Errors</th>
                </tr>
              </thead>
              <tbody>
                {report.history.map((row) => (
                  <tr key={row.id} className="border-b border-zinc-800/60 text-zinc-300">
                    <td className="px-2 py-2">{formatTimestamp(row.at)}</td>
                    <td className="px-2 py-2">{row.executiveEmail ?? row.executiveUserId}</td>
                    <td className="px-2 py-2">{actionLabel(row.recommendation)}</td>
                    <td className="px-2 py-2">{row.approved ? "Yes" : "No"}</td>
                    <td className="px-2 py-2">{row.executed ? "Yes" : "No"}</td>
                    <td className="px-2 py-2">{row.result ?? "—"}</td>
                    <td className="px-2 py-2">{row.paperworkSent ?? "—"}</td>
                    <td className="px-2 py-2">{row.dropboxRequests ?? "—"}</td>
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
