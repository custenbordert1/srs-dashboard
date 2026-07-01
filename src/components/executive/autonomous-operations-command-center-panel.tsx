"use client";

import {
  CollapsibleSection,
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  ExecutiveWarningList,
  MetricCard,
  SectionHeader,
  StatusBadge,
} from "@/components/executive/ui";
import type { OperationsCommandCenterReport } from "@/lib/p126-autonomous-operations-command-center/types";
import { useCallback, useEffect, useMemo, useState } from "react";

function formatDuration(ms: number | null | undefined): string {
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

type TimeRange = "today" | "yesterday" | "last7days" | "lastHour" | "all";

export function AutonomousOperationsCommandCenterPanel() {
  const [report, setReport] = useState<OperationsCommandCenterReport | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("today");
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [approvalDecision, setApprovalDecision] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      scope: "paperwork",
      timeRange,
      refresh: "true",
    });
    if (errorsOnly) params.set("errorsOnly", "true");
    if (candidateQuery.trim()) params.set("candidate", candidateQuery.trim());
    if (approvalDecision) params.set("approvalDecision", approvalDecision);
    return params.toString();
  }, [timeRange, errorsOnly, candidateQuery, approvalDecision]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/autonomous-operations-center?${queryString}`, { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        operationsCommandCenter?: OperationsCommandCenterReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.operationsCommandCenter) {
        setError(data.error ?? "Failed to load operations command center");
        return;
      }
      setReport(data.operationsCommandCenter);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load operations command center");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  const postRunnerAction = async (path: string) => {
    setRunning(true);
    setActionMessage(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setActionMessage(data.error ?? "Runner action failed");
        return;
      }
      setActionMessage("Runner action accepted.");
      await load();
    } catch {
      setActionMessage("Runner action failed");
    } finally {
      setRunning(false);
    }
  };

  if (loading && !report) {
    return <ExecutivePanelLoading title="Autonomous Operations Command Center" badge="P126" />;
  }
  if (error || !report) {
    return (
      <ExecutivePanelError
        title="Autonomous Operations Command Center"
        message={error ?? "No report"}
        onRetry={() => void load()}
      />
    );
  }

  const selectedCandidate =
    report.candidateSummary.find((c) => c.candidateId === selectedCandidateId) ??
    report.candidateSummary[0] ??
    null;

  return (
    <div className="space-y-8">
      <ExecutiveCard variant="premium">
        <SectionHeader
          title="Autonomous Operations Command Center"
          subtitle="P126 — production monitoring for P122/P123/P124/P125 autonomous paperwork"
          badge="P126"
        />
        <ExecutiveWarningList warnings={warnings} />

        <div className="mb-4 flex flex-wrap gap-2">
          <StatusBadge tone={report.runner.runningPausedIdle === "running" ? "success" : "neutral"}>
            {report.runner.runningPausedIdle}
          </StatusBadge>
          <StatusBadge tone={report.health.runnerHealth === "healthy" ? "success" : "warning"}>
            {`Runner ${report.health.runnerHealth}`}
          </StatusBadge>
          <StatusBadge tone={report.health.orchestrator === "healthy" ? "success" : "warning"}>
            {`Orchestrator ${report.health.orchestrator}`}
          </StatusBadge>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <select
            className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7days">Last 7 days</option>
            <option value="lastHour">Last hour</option>
            <option value="all">All</option>
          </select>
          <input
            className="min-w-[200px] rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
            placeholder="Search candidate"
            value={candidateQuery}
            onChange={(e) => setCandidateQuery(e.target.value)}
          />
          <select
            className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-200"
            value={approvalDecision}
            onChange={(e) => setApprovalDecision(e.target.value)}
          >
            <option value="">All approvals</option>
            <option value="AUTO_APPROVED">AUTO_APPROVED</option>
            <option value="NEEDS_HUMAN_APPROVAL">NEEDS_HUMAN_APPROVAL</option>
            <option value="BLOCKED">BLOCKED</option>
            <option value="WAITING">WAITING</option>
            <option value="REJECTED_FOR_SAFETY">REJECTED_FOR_SAFETY</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} />
            Errors only
          </label>
          <button
            type="button"
            className="rounded-md border border-zinc-700 px-3 py-1 text-sm text-zinc-200"
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
      </ExecutiveCard>

      <ExecutiveCard>
        <SectionHeader title="Runner Status" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="Current state" value={report.runner.currentState} />
          <MetricCard label="Last cycle" value={formatTimestamp(report.runner.lastCycleAt)} />
          <MetricCard label="Next cycle" value={formatTimestamp(report.runner.nextCycleAt)} />
          <MetricCard label="Uptime" value={formatDuration(report.runner.uptimeMs)} />
          <MetricCard label="Heartbeat" value={report.runner.heartbeat.healthy ? "OK" : "Stale"} />
          <MetricCard label="Current candidate" value={report.runner.currentCandidate?.candidateName ?? "—"} />
          <MetricCard label="Current action" value={report.runner.currentAction} />
          <MetricCard label="Avg cycle time" value={formatDuration(report.runner.averageCycleTimeMs)} />
        </div>
      </ExecutiveCard>

      <ExecutiveCard>
        <SectionHeader title="Queue Summary" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <MetricCard label="Ready to send" value={report.queue.readyToSend.toLocaleString()} />
          <MetricCard label="Waiting approval" value={report.queue.waitingApproval.toLocaleString()} />
          <MetricCard label="Human review" value={report.queue.humanReview.toLocaleString()} />
          <MetricCard label="Blocked" value={report.queue.blocked.toLocaleString()} />
          <MetricCard label="Retry queue" value={report.queue.retryQueue.toLocaleString()} />
          <MetricCard label="Completed today" value={report.queue.completedToday.toLocaleString()} />
          <MetricCard label="Failed today" value={report.queue.failedToday.toLocaleString()} />
          <MetricCard label="Duplicate prevented" value={report.queue.duplicatePrevented.toLocaleString()} />
          <MetricCard label="Skipped" value={report.queue.skipped.toLocaleString()} />
        </div>
      </ExecutiveCard>

      <ExecutiveCard>
        <SectionHeader title="Executive Metrics" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="Today's sends" value={report.metrics.todaysSends.toLocaleString()} />
          <MetricCard label="Success rate" value={`${report.metrics.successRate}%`} />
          <MetricCard label="Avg send time" value={`${report.metrics.averageSendTimeMinutes}m`} />
          <MetricCard label="Current queue" value={report.metrics.currentQueue.toLocaleString()} />
          <MetricCard label="Ready candidates" value={report.metrics.readyCandidates.toLocaleString()} />
          <MetricCard label="Approval rate" value={`${report.metrics.approvalRate}%`} />
          <MetricCard label="Human review %" value={`${report.metrics.humanReviewPercent}%`} />
          <MetricCard label="Failure %" value={`${report.metrics.failurePercent}%`} />
        </div>
      </ExecutiveCard>

      <ExecutiveCard>
        <SectionHeader title="Health Dashboard" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="Runner" value={report.health.runnerHealth} />
          <MetricCard label="Dropbox Sign" value={report.health.dropboxSign} />
          <MetricCard label="Approval engine" value={report.health.approvalEngine} />
          <MetricCard label="Orchestrator" value={report.health.orchestrator} />
          <MetricCard label="Queue" value={report.health.queue} />
          <MetricCard label="API latency" value={`${report.health.apiLatencyMs}ms`} />
          <MetricCard label="Last successful send" value={formatTimestamp(report.health.lastSuccessfulSendAt)} />
          <MetricCard label="Retry backlog" value={report.health.retryBacklog.toLocaleString()} />
        </div>
      </ExecutiveCard>

      <ExecutiveCard>
        <SectionHeader title="Runner Controls" subtitle="Delegates to P125 — no batch send or bypass" />
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={running}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
            onClick={() => void postRunnerAction("/api/autonomous-paperwork-runner/run-once")}
          >
            Run one cycle
          </button>
          <button
            type="button"
            disabled={running}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
            onClick={() => void postRunnerAction("/api/autonomous-paperwork-runner/pause")}
          >
            Pause
          </button>
          <button
            type="button"
            disabled={running}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
            onClick={() => void postRunnerAction("/api/autonomous-paperwork-runner/resume")}
          >
            Resume
          </button>
          <button
            type="button"
            disabled={running}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200"
            onClick={() => void postRunnerAction("/api/autonomous-paperwork-runner/stop")}
          >
            Stop
          </button>
        </div>
        {actionMessage ? <p className="text-sm text-zinc-300">{actionMessage}</p> : null}
      </ExecutiveCard>

      <ExecutiveCard>
        <SectionHeader title="Live Activity Timeline" />
        {report.timeline.length === 0 ? (
          <p className="text-sm text-zinc-500">No activity for selected filters.</p>
        ) : (
          <ul className="space-y-2 text-sm text-zinc-300">
            {report.timeline.slice(0, 25).map((entry) => (
              <li key={entry.auditId} className="rounded border border-zinc-800/60 px-3 py-2">
                <div className="flex flex-wrap gap-2 text-xs text-zinc-500">
                  <span>{formatTimestamp(entry.at)}</span>
                  <span>{entry.source}</span>
                  <span>{entry.auditId}</span>
                </div>
                <div className="mt-1 font-medium text-zinc-100">
                  {entry.candidateName ?? entry.candidateId ?? "System"} — {entry.action}
                </div>
                <div>
                  Result: {entry.result}
                  {entry.durationMs != null ? ` · ${formatDuration(entry.durationMs)}` : ""}
                </div>
                {entry.reason ? <div className="text-zinc-400">Reason: {entry.reason}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </ExecutiveCard>

      <ExecutiveCard>
        <SectionHeader title="Candidate Drilldown" />
        <div className="mb-3 grid gap-3 md:grid-cols-2">
          <select
            className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-sm text-zinc-200"
            value={selectedCandidate?.candidateId ?? ""}
            onChange={(e) => setSelectedCandidateId(e.target.value || null)}
          >
            <option value="">Select candidate</option>
            {report.candidateSummary.map((candidate) => (
              <option key={candidate.candidateId} value={candidate.candidateId}>
                {candidate.candidateName} ({candidate.approvalDecision})
              </option>
            ))}
          </select>
        </div>
        {selectedCandidate ? (
          <div className="space-y-2 text-sm text-zinc-300">
            <p>
              <span className="font-medium text-zinc-100">Approval:</span>{" "}
              {selectedCandidate.approvalDecision} ({selectedCandidate.approvalScore}%)
            </p>
            <p>
              <span className="font-medium text-zinc-100">Eligibility:</span> {selectedCandidate.eligibilityStatus}
            </p>
            <p>
              <span className="font-medium text-zinc-100">Queue position:</span>{" "}
              {selectedCandidate.queuePosition ?? "—"}
            </p>
            <p>
              <span className="font-medium text-zinc-100">Dropbox Sign:</span> {selectedCandidate.dropboxSignStatus}
            </p>
            <pre className="overflow-x-auto rounded border border-zinc-800/60 bg-zinc-950/40 p-3 text-xs whitespace-pre-wrap">
              {selectedCandidate.decisionExplanation}
            </pre>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No candidates match current filters.</p>
        )}
      </ExecutiveCard>

      <CollapsibleSection
        id="p126-diagnostics"
        title="Diagnostics"
        subtitle="Errors, retries, safety failures, duplicate prevention, lock recovery"
        defaultOpen={false}
      >
        <div className="space-y-4 text-sm text-zinc-300">
          <div>
            <h4 className="mb-1 font-medium text-zinc-100">Recent errors</h4>
            <ul className="list-disc pl-5">
              {report.diagnostics.recentErrors.length === 0 ? (
                <li>None</li>
              ) : (
                report.diagnostics.recentErrors.map((item) => <li key={item}>{item}</li>)
              )}
            </ul>
          </div>
          <div>
            <h4 className="mb-1 font-medium text-zinc-100">Safety gate failures</h4>
            <ul className="list-disc pl-5">
              {report.diagnostics.safetyGateFailures.length === 0 ? (
                <li>None</li>
              ) : (
                report.diagnostics.safetyGateFailures.map((item) => <li key={item}>{item}</li>)
              )}
            </ul>
          </div>
          <div>
            <h4 className="mb-1 font-medium text-zinc-100">Duplicate prevention</h4>
            <ul className="list-disc pl-5">
              {report.diagnostics.duplicatePreventionEvents.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-1 font-medium text-zinc-100">Lock recovery</h4>
            <ul className="list-disc pl-5">
              {report.diagnostics.lockRecoveryEvents.length === 0 ? (
                <li>None</li>
              ) : (
                report.diagnostics.lockRecoveryEvents.map((item) => <li key={item}>{item}</li>)
              )}
            </ul>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
