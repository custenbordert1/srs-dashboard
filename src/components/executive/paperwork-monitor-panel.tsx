"use client";

import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import type { PaperworkMonitorReport } from "@/lib/paperwork-monitor/types";
import { useCallback, useEffect, useState } from "react";

export function PaperworkMonitorPanel() {
  const [report, setReport] = useState<PaperworkMonitorReport | null>(null);
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
      const res = await fetch("/api/paperwork-monitor", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        paperworkMonitor?: PaperworkMonitorReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.paperworkMonitor) {
        setError(data.error ?? "Failed to load paperwork monitor");
        return;
      }
      setReport(data.paperworkMonitor);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load paperwork monitor");
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        skippedOverlap?: boolean;
        paperworkMonitor?: PaperworkMonitorReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.paperworkMonitor) {
        setActionError(data.error ?? "Action failed");
        return;
      }
      setReport(data.paperworkMonitor);
      setWarnings(data.warnings ?? []);
      setActionResult(
        data.skippedOverlap ? "Skipped — overlap lock." : "Monitor cycle complete.",
      );
    } catch {
      setActionError("Action failed");
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <ExecutivePanelLoading title="Paperwork Monitor" badge="P107" />;
  if (error || !report)
    return <ExecutivePanelError title="Paperwork Monitor" message={error ?? "No report"} onRetry={load} />;

  const m = report.metrics;
  const s = report.state;
  const statusLabel =
    s.runnerStatus === "running" ? "Running" : s.scheduleEnabled ? "Scheduled" : "Stopped";

  return (
    <ExecutiveCard>
      <SectionHeader
        title="Paperwork Monitor"
        subtitle="P107 — Dropbox Sign sync, reminders, automatic onboarding"
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Runner" value={statusLabel} />
        <MetricCard label="Active packets" value={m.activePackets.toLocaleString()} />
        <MetricCard label="Awaiting signature" value={m.awaitingSignature.toLocaleString()} />
        <MetricCard label="Viewed" value={m.viewed.toLocaleString()} />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <MetricCard label="Signed today" value={m.signedToday.toLocaleString()} />
        <MetricCard label="Completed" value={m.completed.toLocaleString()} />
        <MetricCard label="Ready for onboarding" value={m.readyForOnboarding.toLocaleString()} />
        <MetricCard label="Needs reminder" value={m.needsReminder.toLocaleString()} />
        <MetricCard label="Needs recruiter" value={m.needsRecruiter.toLocaleString()} />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Text queue" value={m.textQueueCount.toLocaleString()} />
        <MetricCard label="Email queue" value={m.emailQueueCount.toLocaleString()} />
        <MetricCard
          label="Completion rate"
          value={m.completionRate != null ? `${Math.round(m.completionRate * 100)}%` : "—"}
        />
        <MetricCard
          label="Avg view→sign"
          value={
            m.averageViewToSignMs != null
              ? `${Math.round(m.averageViewToSignMs / 60000)}m`
              : "—"
          }
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm"
          disabled={running}
          onClick={() => void postAction("/api/paperwork-monitor/check", { dryRun: true })}
        >
          dryRun check
        </button>
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm"
          disabled={running}
          onClick={() => void postAction("/api/paperwork-monitor/run", { mode: "runOnce" })}
        >
          run sync
        </button>
      </div>

      {actionError ? <p className="mb-2 text-sm text-red-600">{actionError}</p> : null}
      {actionResult ? <p className="mb-2 text-sm text-green-700">{actionResult}</p> : null}
      {s.lastError ? <p className="mb-2 text-sm text-amber-700">Last error: {s.lastError}</p> : null}

      <SectionHeader title="Active Candidates" />
      <ul className="mb-4 space-y-1 text-sm">
        {report.candidates.length === 0 ? (
          <li className="text-muted-foreground">No active paperwork packets</li>
        ) : (
          report.candidates.slice(0, 12).map((c) => (
            <li key={c.candidateId}>
              {c.candidateName} — {c.dropboxStatus} — {c.workflowStatus ?? "—"}
              {c.timeline.length > 1 ? ` (${c.timeline.join(" → ")})` : ""}
            </li>
          ))
        )}
      </ul>

      <SectionHeader title="Reminder Queues" />
      <ul className="mb-4 space-y-1 text-sm">
        {[...s.textQueue, ...s.emailQueue, ...s.recruiterQueue, ...s.needsAttention]
          .slice(0, 10)
          .map((q) => (
            <li key={q.id}>
              {q.candidateName} — {q.channel} — {q.reason}
            </li>
          ))}
        {s.textQueue.length + s.emailQueue.length + s.recruiterQueue.length + s.needsAttention.length ===
        0 ? (
          <li className="text-muted-foreground">No reminders queued</li>
        ) : null}
      </ul>

      <p className="text-xs text-muted-foreground">
        Audit: {report.artifactPaths.monitorAudit}
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
