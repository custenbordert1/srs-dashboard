"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import type { AutonomousPaperworkRunnerReport } from "@/lib/autonomous-paperwork-runner/types";
import { useCallback, useEffect, useState } from "react";

export function AutonomousPaperworkRunnerPanel() {
  const [report, setReport] = useState<AutonomousPaperworkRunnerReport | null>(null);
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
        autonomousPaperworkRunner?: AutonomousPaperworkRunnerReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.autonomousPaperworkRunner) {
        setError(data.error ?? "Failed to load autonomous paperwork runner");
        return;
      }
      setReport(data.autonomousPaperworkRunner);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load autonomous paperwork runner");
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
        autonomousPaperworkRunner?: AutonomousPaperworkRunnerReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.autonomousPaperworkRunner) {
        setActionError(data.error ?? "Action failed");
        return;
      }
      setReport(data.autonomousPaperworkRunner);
      setWarnings(data.warnings ?? []);
      setActionResult(
        data.skippedOverlap
          ? "Skipped — previous run still executing."
          : `Cycle complete (${data.autonomousPaperworkRunner.mode}).`,
      );
    } catch {
      setActionError("Action failed");
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <ExecutivePanelLoading title="Autonomous Paperwork Runner" badge="P106.1" />;
  if (error || !report)
    return (
      <ExecutivePanelError title="Autonomous Paperwork Runner" message={error ?? "No report"} onRetry={load} />
    );

  const s = report.state;
  const m = report.metrics;
  const statusLabel =
    s.runnerStatus === "running" ? "Running" : s.scheduleEnabled ? "Scheduled (idle)" : "Stopped";

  return (
    <ExecutiveCard>
      <SectionHeader
        title="Autonomous Paperwork Runner"
        subtitle="P106.1 — continuous Breezy monitor, executeOne only"
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Runner status" value={statusLabel} />
        <MetricCard label="Last run" value={s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : "—"} />
        <MetricCard
          label="Next run"
          value={report.nextScheduledRunAt ? new Date(report.nextScheduledRunAt).toLocaleString() : "—"}
        />
        <MetricCard label="Run count" value={s.runCount.toLocaleString()} />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <MetricCard label="Evaluated" value={m.candidatesEvaluated.toLocaleString()} />
        <MetricCard label="New" value={m.newCandidates.toLocaleString()} />
        <MetricCard label="Sent" value={m.candidatesSent.toLocaleString()} />
        <MetricCard label="Skipped sent" value={m.skippedAlreadySent.toLocaleString()} />
        <MetricCard label="Blocked" value={m.blocked.toLocaleString()} />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <MetricCard label="Invalid email" value={m.blockedInvalidEmail.toLocaleString()} />
        <MetricCard label="Duplicate" value={m.blockedDuplicate.toLocaleString()} />
        <MetricCard label="Unpublished job" value={m.blockedUnpublishedJob.toLocaleString()} />
        <MetricCard label="Closed job" value={m.blockedClosedJob.toLocaleString()} />
        <MetricCard label="Manual review" value={m.blockedManualReview.toLocaleString()} />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <MetricCard
          label="Avg run time"
          value={
            report.runnerHealth.averageRunTimeMs != null
              ? `${Math.round(report.runnerHealth.averageRunTimeMs / 1000)}s`
              : "—"
          }
        />
        <MetricCard label="Health" value={report.runnerHealth.healthy ? "Healthy" : "Degraded"} />
        <MetricCard label="Last error" value={s.lastError ? "Yes" : "None"} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm"
          disabled={running}
          onClick={() => void postAction("/api/autonomous-paperwork-runner/run-once", { mode: "dryRun" })}
        >
          dryRun cycle
        </button>
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm"
          disabled={running}
          onClick={() => void postAction("/api/autonomous-paperwork-runner/run-once", { mode: "runOnce" })}
        >
          runOnce
        </button>
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm"
          disabled={running}
          onClick={() => void postAction("/api/autonomous-paperwork-runner/full-reconciliation")}
        >
          full reconciliation
        </button>
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm"
          disabled={running}
          onClick={() => void postAction("/api/autonomous-paperwork-runner/start")}
        >
          start schedule
        </button>
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm"
          disabled={running}
          onClick={() => void postAction("/api/autonomous-paperwork-runner/stop")}
        >
          stop
        </button>
      </div>

      {actionError ? <p className="mb-2 text-sm text-red-600">{actionError}</p> : null}
      {actionResult ? <p className="mb-2 text-sm text-green-700">{actionResult}</p> : null}
      {s.lastError ? <p className="mb-2 text-sm text-amber-700">Last error: {s.lastError}</p> : null}

      <SectionHeader title="Current Queue" />
      <ul className="mb-4 space-y-1 text-sm">
        {report.currentQueue.length === 0 ? (
          <li className="text-muted-foreground">Empty — no candidates in last cycle</li>
        ) : (
          report.currentQueue.slice(0, 15).map((c) => (
            <li key={c.candidateId}>
              {c.category === "ready_to_send" ? "✓" : "✗"} {c.candidateName} — {c.blockerReason ?? c.category}
            </li>
          ))
        )}
      </ul>

      <SectionHeader title="Blocked Registry" />
      <ul className="mb-4 space-y-1 text-sm">
        {Object.keys(s.blockedRegistry).length === 0 ? (
          <li className="text-muted-foreground">None</li>
        ) : (
          Object.values(s.blockedRegistry)
            .slice(0, 15)
            .map((b) => (
              <li key={b.candidateId}>
                ✗ {b.candidateName} — {b.blockerReason}
              </li>
            ))
        )}
      </ul>

      <p className="text-xs text-muted-foreground">
        Audit: {report.artifactPaths.runnerAudit} · State: {report.artifactPaths.runnerState}
      </p>

      {warnings.length > 0 ? (
        <ul className="mt-2 text-xs text-muted-foreground">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
    </ExecutiveCard>
  );
}
