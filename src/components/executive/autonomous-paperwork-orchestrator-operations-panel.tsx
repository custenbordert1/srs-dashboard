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
import type { PaperworkCycleReport } from "@/lib/autonomous-paperwork-orchestrator/types";
import { formatOperatorTimeline } from "@/lib/autonomous-paperwork-orchestrator/operator-timeline";
import { useCallback, useEffect, useState } from "react";

export function AutonomousPaperworkOrchestratorOperationsPanel() {
  const [report, setReport] = useState<PaperworkCycleReport | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/paperwork-cycle?refresh=true", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        paperworkCycle?: { currentCycle: PaperworkCycleReport; warnings?: string[] };
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.paperworkCycle?.currentCycle) {
        setError(data.error ?? "Failed to load paperwork cycle");
        return;
      }
      setReport(data.paperworkCycle.currentCycle);
      setWarnings(data.warnings ?? data.paperworkCycle.currentCycle.warnings ?? []);
    } catch {
      setError("Failed to load paperwork cycle");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <ExecutivePanelLoading title="Autonomous Paperwork Operations" badge="P123" />;
  }
  if (error || !report) {
    return (
      <ExecutivePanelError
        title="Autonomous Paperwork Operations"
        message={error ?? "No cycle report"}
        onRetry={() => void load()}
      />
    );
  }

  const timeline = formatOperatorTimeline(report.operatorTimeline);

  return (
    <ExecutiveCard id="autonomous-paperwork-orchestrator-operations" variant="premium">
      <SectionHeader
        title="Autonomous Paperwork Operations"
        subtitle="P123/P124 — eligibility, approval, queue, safety, and executeOne orchestration (preview)"
        badge="P123"
      />

      <ExecutiveWarningList warnings={warnings} />

      <div className="mb-5 flex flex-wrap gap-2">
        <StatusBadge tone={report.cycleStatus === "completed" ? "success" : "neutral"}>
          {`Cycle ${report.cycleStatus}`}
        </StatusBadge>
        <StatusBadge tone={report.pilotMode ? "success" : "neutral"}>
          {`Pilot ${report.pilotMode ? "on" : "off"}`}
        </StatusBadge>
        <StatusBadge tone={report.liveMode ? "success" : "neutral"}>
          {`Live ${report.liveMode ? "on" : "off"}`}
        </StatusBadge>
        <StatusBadge tone={report.operatorMode === "GO" ? "success" : "warning"}>
          {`Operator ${report.operatorMode}`}
        </StatusBadge>
        <StatusBadge tone={report.safetyState.goNoGo === "GO" ? "success" : "warning"}>
          {report.safetyState.goNoGo}
        </StatusBadge>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Queue depth" value={report.metrics.queueDepth.toLocaleString()} />
        <MetricCard label="Candidates ready" value={report.metrics.readyCount.toLocaleString()} />
        <MetricCard label="Candidates blocked" value={report.metrics.blockedCount.toLocaleString()} />
        <MetricCard label="Success rate" value={`${report.metrics.successRate}%`} />
        <MetricCard
          label="Next candidate"
          value={report.sendQueue.nextCandidate?.candidateName ?? "—"}
        />
        <MetricCard label="Last send" value={report.lastExecutionAt ? "Recorded" : "—"} />
        <MetricCard label="Avg send time" value={`${report.metrics.averageSendTimeMinutes}m`} />
        <MetricCard
          label="Est. finish"
          value={report.etaMinutes != null ? `${report.etaMinutes}m` : "—"}
        />
      </div>

      {report.approvalSummary ? (
        <div className="mb-6 rounded-lg border border-zinc-800/80 bg-zinc-950/30 px-4 py-3">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            P124 Approval summary
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <MetricCard label="Auto approved" value={report.approvalSummary.autoApproved.toLocaleString()} />
            <MetricCard
              label="Needs human approval"
              value={report.approvalSummary.needsHumanApproval.toLocaleString()}
            />
            <MetricCard label="Blocked" value={report.approvalSummary.blocked.toLocaleString()} />
            <MetricCard label="Waiting" value={report.approvalSummary.waiting.toLocaleString()} />
            <MetricCard
              label="Rejected for safety"
              value={report.approvalSummary.rejectedForSafety.toLocaleString()}
            />
            <MetricCard
              label="Avg approval score"
              value={`${report.approvalSummary.averageApprovalScore}%`}
            />
          </div>
          {report.approvalSummary.topBlockers.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Top blockers</p>
              <ul className="mt-1 space-y-1 text-sm text-zinc-300">
                {report.approvalSummary.topBlockers.slice(0, 3).map((blocker) => (
                  <li key={blocker.reason}>
                    {blocker.reason} ({blocker.count})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {report.approvalSummary.highestConfidenceReady.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Highest confidence ready
              </p>
              <ul className="mt-1 space-y-1 text-sm text-zinc-300">
                {report.approvalSummary.highestConfidenceReady.slice(0, 3).map((candidate) => (
                  <li key={candidate.candidateId}>
                    {candidate.candidateName} — {candidate.approvalScore}%
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4 rounded-lg border border-zinc-800/80 bg-zinc-950/30 px-4 py-3 text-sm text-zinc-300">
        <p>
          <span className="font-medium text-zinc-100">Approval required: </span>
          {report.approvalRequired ? "Yes for mapping-gated candidates" : "No for native ready queue"}
        </p>
        <p className="mt-1">
          <span className="font-medium text-zinc-100">Current step: </span>
          {report.currentStep} ({report.progressPercent}%)
        </p>
      </div>

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Operator timeline</h3>
      {timeline.length === 0 ? (
        <p className="text-sm text-zinc-500">No timeline events yet.</p>
      ) : (
        <ul className="space-y-1 text-sm text-zinc-300">
          {timeline.map((line) => (
            <li key={line} className="rounded border border-zinc-800/60 px-3 py-1.5">
              {line}
            </li>
          ))}
        </ul>
      )}
    </ExecutiveCard>
  );
}
