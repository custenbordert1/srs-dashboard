"use client";

import type {
  BreezySyncHealthSnapshot,
  BreezySyncStatus,
  BreezyTokenStatus,
} from "@/lib/breezy-sync-status";
import {
  DataHealthRequestTimeoutError,
  fetchJsonWithTimeout,
  logDataHealthTiming,
} from "@/lib/data-health-fetch";
import { useCallback, useEffect, useRef, useState } from "react";

const STATUS_STYLES: Record<BreezySyncStatus, string> = {
  ready: "border-teal-500/30 bg-teal-500/10 text-teal-200",
  "safe-mode": "border-sky-500/30 bg-sky-500/10 text-sky-200",
  queued: "border-violet-500/30 bg-violet-500/10 text-violet-200",
  syncing: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  failed: "border-rose-500/30 bg-rose-500/10 text-rose-200",
};

const TOKEN_STYLES: Record<BreezyTokenStatus, string> = {
  configured: "border-teal-500/30 bg-teal-500/10 text-teal-200",
  missing: "border-amber-500/30 bg-amber-500/10 text-amber-200",
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "No live sync yet";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50 tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function SyncCardSkeleton() {
  return (
    <div className="h-24 animate-pulse rounded-xl border border-zinc-800/80 bg-zinc-950/40" />
  );
}

export function BreezySyncHealthSection() {
  const [snapshot, setSnapshot] = useState<BreezySyncHealthSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const loadGeneration = useRef(0);

  const load = useCallback(async (generation: number) => {
    setLoading(true);
    setError(null);
    const started = performance.now();
    try {
      const data = await fetchJsonWithTimeout<BreezySyncHealthSnapshot>("/api/breezy/sync-health", {
        label: "breezy-sync-health",
      });
      if (generation !== loadGeneration.current) return;
      setSnapshot(data);
    } catch (err) {
      if (generation !== loadGeneration.current) return;
      const message =
        err instanceof DataHealthRequestTimeoutError
          ? `${err.message} — sync health uses jobs + cache peek only.`
          : err instanceof Error
            ? err.message
            : "Failed to load Breezy sync health";
      setError(message);
      setSnapshot(null);
    } finally {
      if (generation === loadGeneration.current) {
        setLoading(false);
        logDataHealthTiming("data-health-load-ms", performance.now() - started, "sync-health");
      }
    }
  }, []);

  useEffect(() => {
    const generation = ++loadGeneration.current;
    void load(generation);
  }, [load]);

  const refresh = () => {
    setManualRefreshing(true);
    const generation = ++loadGeneration.current;
    void load(generation).finally(() => setManualRefreshing(false));
  };

  return (
    <section className="space-y-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Sync Health</h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Lightweight Breezy control-plane check (jobs list + warmed candidate cache). Does not run a
            full position scan.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={manualRefreshing}
          className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {manualRefreshing ? "Refreshing…" : "Refresh sync"}
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
        >
          {error}
        </div>
      ) : null}

      {loading && !snapshot ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <SyncCardSkeleton key={index} />
          ))}
        </div>
      ) : null}

      {snapshot ? (
        <>
          <div className="flex flex-wrap gap-2">
            <span
              className={[
                "inline-flex rounded-full border px-3 py-1 text-xs font-medium",
                STATUS_STYLES[snapshot.syncStatus],
              ].join(" ")}
            >
              Sync status: {snapshot.statusLabel}
            </span>
            <span
              className={[
                "inline-flex rounded-full border px-3 py-1 text-xs font-medium",
                TOKEN_STYLES[snapshot.tokenStatus],
              ].join(" ")}
            >
              Token: {snapshot.tokenStatusLabel}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Last sync time" value={formatDateTime(snapshot.lastSyncTime)} />
            <Metric
              label="Published jobs"
              value={snapshot.jobSync.publishedCount}
              hint={snapshot.jobSync.error ? "Published fetch had errors" : "Live Breezy published positions"}
            />
            <Metric
              label="Draft jobs"
              value={snapshot.jobSync.draftCount}
              hint="Breezy draft pipeline positions"
            />
            <Metric
              label="Cached candidates"
              value={snapshot.candidateSync.candidateCount}
              hint={
                snapshot.candidateSync.fromCache
                  ? snapshot.candidateSync.truncated
                    ? "Truncated — warm full sync from Candidates tab"
                    : "From warmed candidate cache"
                  : "Cache cold"
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              label="Positions scanned"
              value={
                snapshot.candidateSync.positionsScanned !== null &&
                snapshot.candidateSync.positionsAvailable !== null
                  ? `${snapshot.candidateSync.positionsScanned} / ${snapshot.candidateSync.positionsAvailable}`
                  : "—"
              }
            />
            <Metric
              label="Candidate sync"
              value={
                snapshot.candidateSync.fromCache
                  ? snapshot.candidateSync.partial
                    ? "Partial"
                    : snapshot.candidateSync.truncated
                      ? "Truncated"
                      : "Cached"
                  : "Cold"
              }
              hint={
                snapshot.candidateSync.scanMode
                  ? `${snapshot.candidateSync.scanMode} tier`
                  : undefined
              }
            />
            <Metric label="Failed job fetches" value={snapshot.failedJobs} />
            <Metric
              label="Skipped reason"
              value={snapshot.candidateSync.skippedReason ?? "—"}
              hint="When Breezy scan stops early"
            />
          </div>

          {snapshot.candidateSync.hydrationDiagnostics ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Hydration progress"
                value={`${snapshot.candidateSync.hydrationDiagnostics.hydrationPercent}%`}
                hint={`${snapshot.candidateSync.hydrationDiagnostics.positionsCompleted.toLocaleString()} completed this scan · ${snapshot.candidateSync.hydrationDiagnostics.queueDepthRemaining.toLocaleString()} queued`}
              />
              <Metric
                label="Positions attempted"
                value={snapshot.candidateSync.hydrationDiagnostics.positionsAttempted}
                hint={`${snapshot.candidateSync.hydrationDiagnostics.positionsSkipped.toLocaleString()} skipped in last scan`}
              />
              <Metric
                label="Timeout source"
                value={snapshot.candidateSync.hydrationDiagnostics.timeoutSource ?? "none"}
                hint={
                  snapshot.candidateSync.hydrationDiagnostics.averagePositionLatencyMs
                    ? `~${snapshot.candidateSync.hydrationDiagnostics.averagePositionLatencyMs}ms avg / position`
                    : undefined
                }
              />
              <Metric
                label="Est. remaining scan"
                value={
                  snapshot.candidateSync.hydrationDiagnostics.estimatedRemainingScanMs
                    ? `${Math.round(snapshot.candidateSync.hydrationDiagnostics.estimatedRemainingScanMs / 1000)}s`
                    : snapshot.candidateSync.hydrationComplete
                      ? "Complete"
                      : "—"
                }
                hint={`Last scan ${Math.round(snapshot.candidateSync.hydrationDiagnostics.scanDurationMs / 1000)}s`}
              />
            </div>
          ) : null}

          {snapshot.candidateSync.hydrationJob ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Hydration owner"
                value={snapshot.candidateSync.hydrationJob.hydrationOwnerId ?? "—"}
                hint={
                  snapshot.candidateSync.hydrationJob.hydrationInProgress
                    ? "Active hydration lock"
                    : "Idle"
                }
              />
              <Metric
                label="Last heartbeat"
                value={
                  snapshot.candidateSync.hydrationJob.hydrationHeartbeat
                    ? new Date(snapshot.candidateSync.hydrationJob.hydrationHeartbeat).toLocaleTimeString()
                    : "—"
                }
                hint={
                  snapshot.candidateSync.hydrationJob.hydrationStalled
                    ? "Stalled"
                    : snapshot.candidateSync.hydrationJob.hydrationInProgress
                      ? "Healthy"
                      : "Not running"
                }
              />
              <Metric
                label="Last progress"
                value={
                  snapshot.candidateSync.hydrationJob.lastProgressAt
                    ? new Date(snapshot.candidateSync.hydrationJob.lastProgressAt).toLocaleTimeString()
                    : "—"
                }
                hint={`Reclaim ${snapshot.candidateSync.hydrationJob.reclaimCount}`}
              />
              <Metric
                label="Hydration age"
                value={
                  snapshot.candidateSync.hydrationJob.hydrationStartedAt
                    ? `${Math.round(
                        (Date.now() -
                          Date.parse(snapshot.candidateSync.hydrationJob.hydrationStartedAt)) /
                          1000,
                      )}s`
                    : "—"
                }
                hint={
                  snapshot.candidateSync.hydrationJob.hydrationStalled ? "Stalled job" : "Active session"
                }
              />
              <Metric
                label="Hydration round"
                value={snapshot.candidateSync.hydrationJob.hydrationRoundId.slice(0, 8)}
                hint={`Resume ${snapshot.candidateSync.hydrationJob.resumeCount} · Restart ${snapshot.candidateSync.hydrationJob.restartCount}`}
              />
              <Metric
                label="Continuation point"
                value={snapshot.candidateSync.hydrationJob.lastContinuationPoint}
                hint={`${snapshot.candidateSync.hydrationJob.positionsScanned} positions scanned`}
              />
              <Metric
                label="Queue remaining"
                value={snapshot.candidateSync.hydrationJob.estimatedRemainingPositions}
                hint={`${snapshot.candidateSync.hydrationJob.hydrationPercent}% complete`}
              />
              <Metric
                label="Stalled status"
                value={snapshot.candidateSync.hydrationJob.hydrationStalled ? "Yes" : "No"}
                hint={
                  snapshot.candidateSync.hydrationJob.lastUpdatedAt
                    ? `Updated ${new Date(snapshot.candidateSync.hydrationJob.lastUpdatedAt).toLocaleTimeString()}`
                    : "No timestamp"
                }
              />
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
              <h3 className="font-semibold text-zinc-100">Rate Limit Protection</h3>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Max / minute</dt>
                  <dd className="mt-1 font-semibold tabular-nums text-zinc-100">
                    {snapshot.rateLimitProtection.maxRequestsPerMinute}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Remaining</dt>
                  <dd className="mt-1 font-semibold tabular-nums text-zinc-100">
                    {snapshot.rateLimitProtection.requestsRemainingThisMinute}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Failed tracked</dt>
                  <dd className="mt-1 font-semibold tabular-nums text-zinc-100">
                    {snapshot.rateLimitProtection.failedRequestsTracked}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Window</dt>
                  <dd className="mt-1 font-semibold tabular-nums text-zinc-100">
                    {snapshot.rateLimitProtection.failedRequestWindowMinutes}m
                  </dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-zinc-500">
                {snapshot.rateLimitProtection.retryBackoffPlaceholder}
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
              <h3 className="font-semibold text-zinc-100">Warnings and Safe Mode</h3>
              <div className="mt-3 space-y-2 text-sm text-zinc-400">
                {[...snapshot.rateLimitWarnings, ...snapshot.notes].map((note) => (
                  <p key={note} className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                    {note}
                  </p>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-950/40">
            <div className="border-b border-zinc-800/80 px-4 py-3">
              <h3 className="font-semibold text-zinc-100">Broken Position Cleanup Queue</h3>
              <p className="mt-1 text-sm text-zinc-500">
                Positions that need retry, remapping, archiving, or permission review before future
                sync jobs run.
              </p>
            </div>
            <table className="min-w-[780px] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800/80 text-xs uppercase tracking-wider text-zinc-500">
                  <th className="px-4 py-3 font-medium">Position name</th>
                  <th className="px-4 py-3 font-medium">Position id</th>
                  <th className="px-4 py-3 font-medium">Error type</th>
                  <th className="px-4 py-3 font-medium text-right">Retry count</th>
                  <th className="px-4 py-3 font-medium">Suggested action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {snapshot.brokenPositionCleanupQueue.map((item) => (
                  <tr key={item.positionId} className="hover:bg-zinc-800/30">
                    <td className="px-4 py-3 font-medium text-zinc-100">{item.positionName}</td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">{item.positionId}</td>
                    <td className="px-4 py-3 text-zinc-300">{item.errorType}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-300">
                      {item.retryCount}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{item.suggestedAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
