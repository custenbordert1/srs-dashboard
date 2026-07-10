"use client";

import { CollapsibleSection } from "@/components/executive/ui/collapsible-section";
import {
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  MetricCard,
  SectionHeader,
} from "@/components/executive/ui";
import type { AutonomousPaperworkOperationsCenterReport } from "@/lib/p118-autonomous-paperwork-operations-center/types";
import { useCallback, useEffect, useState } from "react";

function gateBadge(passed: boolean): string {
  return passed ? "PASS" : "FAIL";
}

export function AutonomousPaperworkOperationsCenterPanel() {
  const [report, setReport] = useState<AutonomousPaperworkOperationsCenterReport | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/autonomous-paperwork-operations-center", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        autonomousPaperworkOperationsCenter?: AutonomousPaperworkOperationsCenterReport;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.autonomousPaperworkOperationsCenter) {
        setError(data.error ?? "Failed to load operations center");
        return;
      }
      setReport(data.autonomousPaperworkOperationsCenter);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load operations center");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <ExecutivePanelLoading title="Autonomous Paperwork Operations" badge="P118" />;
  }
  if (error || !report) {
    return (
      <ExecutivePanelError
        title="Autonomous Paperwork Operations"
        message={error ?? "No report"}
        onRetry={load}
      />
    );
  }

  const h = report.healthSummary;
  const q = report.queueDepth;
  const activeAlerts = report.alerts.filter((alert) => alert.active);

  return (
    <ExecutiveCard id="autonomous-paperwork-operations-center">
      <SectionHeader
        title="Autonomous Paperwork Operations"
        subtitle="P118 — monitoring and visibility only (no sends)"
      />

      <div className="mb-4 rounded-lg border border-zinc-700/60 bg-zinc-900/40 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              report.goNoGo === "GO"
                ? "bg-emerald-500/20 text-emerald-200"
                : "bg-rose-500/20 text-rose-200"
            }`}
          >
            {report.goNoGo}
          </span>
          <span className="text-sm text-zinc-300">{report.goNoGoReason}</span>
        </div>
        <p className="mt-2 text-sm text-zinc-400">{report.summary}</p>
      </div>

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">System status</h3>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Mode" value={h.currentMode} />
        <MetricCard label="Schedule" value={h.runnerScheduleEnabled ? "enabled" : "disabled"} />
        <MetricCard
          label="P117 bridge"
          value={h.approvedBridgeDryRunFlag ? "on" : "off"}
        />
        <MetricCard label="Last result" value={h.lastRunResult} />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <MetricCard
          label="Last run"
          value={h.lastRunAt ? new Date(h.lastRunAt).toLocaleString() : "—"}
        />
        <MetricCard
          label="Duration"
          value={h.lastRunDurationMs != null ? `${h.lastRunDurationMs}ms` : "—"}
        />
        <MetricCard label="Evaluated" value={h.candidatesEvaluated.toLocaleString()} />
        <MetricCard label="Ready" value={h.readyToSend.toLocaleString()} />
        <MetricCard label="Blocked" value={h.blockedCount.toLocaleString()} />
      </div>

      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Queue depth</h3>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Ready to send" value={q.readyToSend.toLocaleString()} />
        <MetricCard label="Approved mapping ready" value={q.approvedMappingReady.toLocaleString()} />
        <MetricCard label="Pending review" value={q.pendingMappingReview.toLocaleString()} />
        <MetricCard label="Not mappable" value={q.projectNotMappable.toLocaleString()} />
        <MetricCard label="Duplicate risk" value={q.duplicateRisk.toLocaleString()} />
        <MetricCard label="Awaiting signature" value={q.awaitingSignature.toLocaleString()} />
      </div>

      <CollapsibleSection title="Safety gates" subtitle="Long audit and gate details" defaultOpen={false}>
        <div className="grid gap-2 md:grid-cols-2">
          {report.safetyStatus.map((gate) => (
            <div
              key={gate.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-zinc-700/50 px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium text-zinc-100">{gate.label}</div>
                <div className="text-xs text-zinc-400">{gate.detail}</div>
              </div>
              <span
                className={`shrink-0 text-xs font-semibold ${
                  gate.passed ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                {gateBadge(gate.passed)}
              </span>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <div className="mt-4">
        <CollapsibleSection
          title={`Alerts (${activeAlerts.length} active)`}
          subtitle="Verbose diagnostics"
          defaultOpen={false}
        >
          <div className="space-y-2">
            {report.alerts.map((alert) => (
              <div
                key={alert.type}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  alert.active
                    ? alert.severity === "critical"
                      ? "border-rose-500/40 bg-rose-500/10"
                      : alert.severity === "warning"
                        ? "border-amber-500/40 bg-amber-500/10"
                        : "border-sky-500/40 bg-sky-500/10"
                    : "border-zinc-700/40 bg-zinc-900/20 opacity-60"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-zinc-100">{alert.type}</span>
                  <span className="text-xs uppercase text-zinc-400">{alert.severity}</span>
                </div>
                <p className="text-zinc-300">{alert.reason}</p>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      </div>

      <div className="mt-4">
        <CollapsibleSection title="Runner audit details" defaultOpen={false}>
          {report.lastRunSummary ? (
            <p className="mb-4 text-sm text-zinc-300">{report.lastRunSummary}</p>
          ) : null}
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-300">
            {report.recommendedActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </CollapsibleSection>
      </div>

      {warnings.length > 0 ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}
    </ExecutiveCard>
  );
}
