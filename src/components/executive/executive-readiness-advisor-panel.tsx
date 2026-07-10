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
import { useExecutiveReadinessAdvisor } from "@/hooks/use-executive-readiness-advisor";
import { trendArrow, trendTone } from "@/lib/p168.2-executive-readiness-advisor/presentation";

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

function importanceTone(
  importance: string,
): "success" | "warning" | "critical" | "neutral" {
  if (importance === "critical") return "critical";
  if (importance === "high") return "warning";
  return "neutral";
}

export function ExecutiveReadinessAdvisorPanel() {
  const { report, error, loading, loadingCeilingHit, showingCachedSnapshot, meta, refresh } =
    useExecutiveReadinessAdvisor();

  if (loading) {
    return <SectionLoadingCard title="Executive Readiness Advisor" badge="P168.2" />;
  }

  if (loadingCeilingHit && !report) {
    return (
      <SectionErrorCard
        title="Executive Readiness Advisor"
        badge="P168.2"
        message="Readiness advisor timed out."
        onRetry={() => void refresh()}
      />
    );
  }

  if (!report) {
    return (
      <SectionErrorCard
        title="Executive Readiness Advisor"
        badge="P168.2"
        message={error ?? "Failed to load readiness advisor"}
        onRetry={() => void refresh()}
      />
    );
  }

  const r = report.currentReadiness;
  const progress = report.recommendationProgress;

  return (
    <div className="space-y-6">
      {(showingCachedSnapshot || error) && (
        <SectionDegradedBanner
          stale={showingCachedSnapshot}
          message={error ?? "Showing cached readiness snapshot."}
          onRetry={() => void refresh()}
        />
      )}

      <ExecutiveCard id="p1682-readiness-advisor" variant="premium">
        <SectionHeader
          title="Executive Readiness Advisor"
          subtitle="Read-only intelligence — why we wait, what must change, and when approval is likely"
          badge="P168.2"
          actions={
            <LastUpdatedBadge
              at={report.generatedAt}
              stale={showingCachedSnapshot}
              ageSeconds={meta?.ageSeconds ?? null}
              refreshing={meta?.refreshing}
            />
          }
        />

        <p className="mb-6 text-sm text-zinc-300">{report.whyWaiting}</p>

        {/* SECTION 1 — Current Readiness */}
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Current readiness
        </h3>
        <div className="mb-4 flex flex-wrap items-end gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Executive readiness</p>
            <p className="text-4xl font-semibold text-zinc-100">{r.executiveReadinessPercent}%</p>
            <p className="text-sm text-zinc-400">{r.gateProgressLabel}</p>
          </div>
          <div className="flex gap-4 text-sm text-zinc-400">
            <span>
              Score <strong className="text-zinc-200">{r.currentScore}</strong>
            </span>
            <span>
              Required <strong className="text-zinc-200">{r.requiredScore}</strong>
            </span>
            <span>
              Remaining <strong className="text-zinc-200">{r.remainingPoints}</strong> pts
            </span>
          </div>
        </div>
        <div className="mb-8">
          <div className="mb-1 flex justify-between text-xs text-zinc-500">
            <span>Approval gates</span>
            <span>
              {progress.gatesComplete} / {progress.gatesTotal} ({progress.percentComplete}%)
            </span>
          </div>
          <div className="font-mono text-sm tracking-widest text-emerald-300/90">
            {progress.progressBar}
          </div>
        </div>

        {/* SECTION 2 — Required Actions */}
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Required actions
        </h3>
        <div className="mb-8 space-y-2">
          {report.actionPlan.map((action) => (
            <div
              key={action.id}
              className={`rounded-md border px-3 py-2 text-sm ${
                action.complete
                  ? "border-emerald-500/20 bg-emerald-500/5 text-zinc-400"
                  : "border-zinc-700 bg-zinc-900/40 text-zinc-200"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span aria-hidden>{action.complete ? "☑" : "□"}</span>
                <span className={action.complete ? "line-through" : ""}>{action.label}</span>
                {!action.complete && (
                  <StatusBadge tone={importanceTone(action.importance)}>
                    {action.importance}
                  </StatusBadge>
                )}
                {!action.complete && action.estimatedImpact > 0 && (
                  <span className="text-xs text-zinc-500">
                    +{action.estimatedImpact}% impact
                  </span>
                )}
              </div>
              {!action.complete && (
                <p className="mt-1 pl-6 text-xs text-zinc-500">
                  {action.currentValue} → {action.targetValue}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* SECTION 3 — Estimated Ready Time */}
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Estimated ready time
        </h3>
        <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard
            label="Estimated ready"
            value={formatTimestamp(report.estimatedReady.estimatedReadyAt)}
          />
          <MetricCard label="Confidence" value={`${report.estimatedReady.confidence}%`} />
          <MetricCard label="Projected sends" value={report.estimatedReady.projectedSends} />
          <MetricCard
            label="Dropbox requests"
            value={report.estimatedReady.projectedDropboxRequests}
          />
          <MetricCard
            label="Queue after run"
            value={report.estimatedReady.estimatedQueueAfterRun}
          />
        </div>
        {report.estimatedReady.remainingBlockers.length > 0 && (
          <ul className="mb-8 list-inside list-disc text-sm text-amber-200/90">
            {report.estimatedReady.remainingBlockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}

        {/* SECTION 4 — Recommendation Progress */}
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Recommendation progress
        </h3>
        <p className="mb-8 text-sm text-zinc-300">
          Progress toward <strong>RUN NEXT BATCH</strong>: {progress.gatesComplete} of{" "}
          {progress.gatesTotal} approval gates complete ({progress.percentComplete}%).
        </p>

        {/* SECTION 5 — What Changed */}
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          What changed
        </h3>
        <p className="mb-2 text-xs text-zinc-500">{report.delta.sinceLabel}</p>
        <div className="mb-8 grid gap-2 sm:grid-cols-2">
          {report.delta.paperworkSentDelta != null && report.delta.paperworkSentDelta !== 0 && (
            <p className="text-sm text-zinc-300">
              {report.delta.paperworkSentDelta > 0 ? "+" : ""}
              {report.delta.paperworkSentDelta} paperwork sent
            </p>
          )}
          <p className="text-sm text-zinc-300">
            Queue {report.delta.queue.before} → {report.delta.queue.after}{" "}
            <StatusBadge tone={trendTone(report.delta.queue.trend)}>
              {`${trendArrow(report.delta.queue.trend)} ${report.delta.queue.trend}`}
            </StatusBadge>
          </p>
          <p className="text-sm text-zinc-300">
            Readiness {report.delta.readiness.before ?? "—"} → {report.delta.readiness.after ?? "—"}{" "}
            <StatusBadge tone={trendTone(report.delta.readiness.trend)}>
              {`${trendArrow(report.delta.readiness.trend)} ${report.delta.readiness.trend}`}
            </StatusBadge>
          </p>
          <p className="text-sm text-zinc-300">
            Deferred {report.delta.deferredBacklog.before} → {report.delta.deferredBacklog.after}{" "}
            <StatusBadge tone={trendTone(report.delta.deferredBacklog.trend)}>
              {`${trendArrow(report.delta.deferredBacklog.trend)} ${report.delta.deferredBacklog.trend}`}
            </StatusBadge>
          </p>
          <p className="text-sm text-zinc-300">
            Decision score {report.delta.decisionScore.before} → {report.delta.decisionScore.after}{" "}
            <StatusBadge tone={trendTone(report.delta.decisionScore.trend)}>
              {`${trendArrow(report.delta.decisionScore.trend)} ${report.delta.decisionScore.trend}`}
            </StatusBadge>
          </p>
          <p className="text-sm text-zinc-300">
            Recommendation: {report.delta.recommendation.summary}
          </p>
        </div>

        {/* SECTION 6 — Timeline */}
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Recommendation timeline
          </h3>
          <button
            type="button"
            className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-300"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </div>
        {report.timeline.length === 0 ? (
          <p className="text-sm text-zinc-500">No timeline entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-2 py-2">Time</th>
                  <th className="px-2 py-2">Recommendation</th>
                  <th className="px-2 py-2">Confidence</th>
                  <th className="px-2 py-2">Decision score</th>
                  <th className="px-2 py-2">Duration</th>
                  <th className="px-2 py-2">Trend</th>
                </tr>
              </thead>
              <tbody>
                {report.timeline.map((row, i) => (
                  <tr key={`${row.at}-${i}`} className="border-b border-zinc-800/60 text-zinc-300">
                    <td className="px-2 py-2">{formatTimestamp(row.at)}</td>
                    <td className="px-2 py-2">{row.recommendation}</td>
                    <td className="px-2 py-2">{row.confidence}%</td>
                    <td className="px-2 py-2">{row.decisionScore}</td>
                    <td className="px-2 py-2">{formatDuration(row.durationSincePriorMs)}</td>
                    <td className="px-2 py-2">
                      <StatusBadge tone={trendTone(row.trend)}>
                        {`${trendArrow(row.trend)} ${row.trend}`}
                      </StatusBadge>
                    </td>
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
