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
import type { ProductionRunnerSnapshot } from "@/lib/p125-autonomous-paperwork-production-runner/types";
import { useCallback, useEffect, useState } from "react";

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${Math.round(ms / 1000)}s`;
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function AutonomousProductionRunnerPanel() {
  const [snapshot, setSnapshot] = useState<ProductionRunnerSnapshot | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/autonomous-paperwork-runner", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        autonomousPaperworkRunner?: ProductionRunnerSnapshot;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.autonomousPaperworkRunner) {
        setError(data.error ?? "Failed to load autonomous runner");
        return;
      }
      setSnapshot(data.autonomousPaperworkRunner);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load autonomous runner");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const postAction = async (path: string, body?: Record<string, unknown>) => {
    setRunning(true);
    setActionError(null);
    setActionResult(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        skippedOverlap?: boolean;
        skippedPaused?: boolean;
        autonomousPaperworkRunner?: ProductionRunnerSnapshot;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.autonomousPaperworkRunner) {
        setActionError(data.error ?? "Action failed");
        return;
      }
      setSnapshot(data.autonomousPaperworkRunner);
      setWarnings(data.warnings ?? []);
      if (data.skippedPaused) {
        setActionResult("Skipped — runner is paused.");
      } else if (data.skippedOverlap) {
        setActionResult("Skipped — previous run still executing.");
      } else {
        setActionResult(`Cycle complete (${data.autonomousPaperworkRunner.mode}).`);
      }
    } catch {
      setActionError("Action failed");
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return <ExecutivePanelLoading title="Autonomous Runner" badge="P125" />;
  }
  if (error || !snapshot) {
    return (
      <ExecutivePanelError
        title="Autonomous Runner"
        message={error ?? "No runner snapshot"}
        onRetry={() => void load()}
      />
    );
  }

  const s = snapshot.state;
  const m = snapshot.metrics;

  return (
    <ExecutiveCard id="autonomous-production-runner" variant="premium">
      <SectionHeader
        title="Autonomous Runner"
        subtitle="P125 — continuous AUTO_APPROVED processing via P122 executeOne (preview/live gated)"
        badge="P125"
      />

      <ExecutiveWarningList warnings={warnings} />

      <div className="mb-5 flex flex-wrap gap-2">
        <StatusBadge tone={snapshot.status === "running" ? "success" : "neutral"}>
          {snapshot.status}
        </StatusBadge>
        <StatusBadge tone={snapshot.safetyStatus.goNoGo === "GO" ? "success" : "warning"}>
          {`Safety ${snapshot.safetyStatus.goNoGo}`}
        </StatusBadge>
        <StatusBadge tone={snapshot.heartbeat.healthy ? "success" : "warning"}>
          {snapshot.heartbeat.healthy ? "Heartbeat OK" : "Heartbeat stale"}
        </StatusBadge>
        <StatusBadge tone="neutral">{snapshot.mode}</StatusBadge>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Queue depth" value={m.queueDepth.toLocaleString()} />
        <MetricCard label="Processed today" value={m.candidatesProcessedToday.toLocaleString()} />
        <MetricCard label="Successful sends" value={m.successfulSends.toLocaleString()} />
        <MetricCard label="Failed sends" value={m.failedSends.toLocaleString()} />
        <MetricCard
          label="Current candidate"
          value={snapshot.currentCandidate?.candidateName ?? "—"}
        />
        <MetricCard label="Avg processing" value={formatDuration(m.averageProcessingTimeMs)} />
        <MetricCard label="Last execution" value={formatTimestamp(snapshot.lastExecutionAt)} />
        <MetricCard label="Next execution" value={formatTimestamp(snapshot.nextExecutionAt)} />
        <MetricCard label="Retry queue" value={m.retryQueueDepth.toLocaleString()} />
        <MetricCard label="Uptime" value={formatDuration(m.uptimeMs)} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
          disabled={running}
          onClick={() => void postAction("/api/autonomous-paperwork-runner/run-once", { mode: "oneCycle" })}
        >
          One cycle
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
          disabled={running}
          onClick={() => void postAction("/api/autonomous-paperwork-runner/start", { oneCycle: false })}
        >
          Continuous
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
          disabled={running}
          onClick={() => void postAction("/api/autonomous-paperwork-runner/pause")}
        >
          Pause
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
          disabled={running}
          onClick={() => void postAction("/api/autonomous-paperwork-runner/resume")}
        >
          Resume
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
          disabled={running}
          onClick={() => void postAction("/api/autonomous-paperwork-runner/stop")}
        >
          Stop
        </button>
      </div>

      {actionError ? <p className="mb-2 text-sm text-red-400">{actionError}</p> : null}
      {actionResult ? <p className="mb-2 text-sm text-emerald-400">{actionResult}</p> : null}
      {s.lastError ? <p className="mb-2 text-sm text-amber-300">Last error: {s.lastError}</p> : null}

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Send queue</h3>
      {snapshot.queue.length === 0 ? (
        <p className="mb-4 text-sm text-zinc-500">No AUTO_APPROVED candidates in queue.</p>
      ) : (
        <ul className="mb-4 space-y-1 text-sm text-zinc-300">
          {snapshot.queue.map((candidate) => (
            <li key={candidate.candidateId} className="rounded border border-zinc-800/60 px-3 py-1.5">
              {candidate.candidateName} — {candidate.approvalDecision} ({candidate.approvalScore}%)
            </li>
          ))}
        </ul>
      )}

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Retry queue</h3>
      {snapshot.retries.length === 0 ? (
        <p className="mb-4 text-sm text-zinc-500">No pending retries.</p>
      ) : (
        <ul className="mb-4 space-y-1 text-sm text-zinc-300">
          {snapshot.retries.map((entry) => (
            <li key={`${entry.candidateId}-${entry.nextRetryAt}`} className="rounded border border-zinc-800/60 px-3 py-1.5">
              {entry.candidateName} — attempt {entry.attempt} at {formatTimestamp(entry.nextRetryAt)}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Recent failures</h3>
      {snapshot.failures.length === 0 ? (
        <p className="text-sm text-zinc-500">None recorded.</p>
      ) : (
        <ul className="space-y-1 text-sm text-zinc-300">
          {snapshot.failures.map((failure) => (
            <li key={`${failure.candidateId}-${failure.failedAt}`} className="rounded border border-zinc-800/60 px-3 py-1.5">
              {failure.candidateName} — {failure.error}
            </li>
          ))}
        </ul>
      )}
    </ExecutiveCard>
  );
}
