"use client";

import {
  ExecutiveButton,
  ExecutiveCard,
  ExecutivePanelError,
  ExecutivePanelLoading,
  ExecutiveWarningList,
  MetricCard,
  SectionHeader,
  StatusBadge,
} from "@/components/executive/ui";
import type { OperationsDashboardSnapshot } from "@/lib/autonomous-operations-center/types";
import { useCallback, useEffect, useState } from "react";

function statusTone(status: string): string {
  switch (status) {
    case "healthy":
      return "text-emerald-300";
    case "warning":
      return "text-amber-300";
    case "critical":
      return "text-red-300";
    default:
      return "text-zinc-400";
  }
}

export function AutonomousOperationsCenterPanel() {
  const [dashboard, setDashboard] = useState<OperationsDashboardSnapshot | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/autonomous-operations-center", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        dashboard?: OperationsDashboardSnapshot;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.dashboard) {
        setError(data.error ?? "Failed to load operations center");
        return;
      }
      setDashboard(data.dashboard);
      setWarnings(data.warnings ?? data.dashboard.warnings ?? []);
    } catch {
      setError("Failed to load operations center");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !dashboard) {
    return <ExecutivePanelLoading title="Autonomous Operations Center" badge="Preview Mode" />;
  }

  if (error && !dashboard) {
    return (
      <ExecutivePanelError title="Autonomous Operations Center" message={error} onRetry={() => void load()} />
    );
  }

  if (!dashboard) return null;

  const m = dashboard.executiveMetrics;

  return (
    <ExecutiveCard id="autonomous-operations-center" variant="accent">
      <SectionHeader
        title="Autonomous Operations Center"
        badge="Preview Mode"
        badgeTone="preview"
        subtitle="P75 platform monitoring · detect, explain, prioritize — no production actions"
        actions={
          <ExecutiveButton onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </ExecutiveButton>
        }
      />

      <div className="mt-5 flex flex-wrap gap-3 text-xs text-zinc-300">
        <span className={`font-semibold uppercase ${statusTone(dashboard.systemHealth.status)}`}>
          System: {dashboard.systemHealth.status}
        </span>
        <span>Platform health: {dashboard.platformHealth.overall}%</span>
        <span>Open incidents: {m.openIncidents}</span>
      </div>

      {warnings.length > 0 ? (
        <div className="mt-5">
          <ExecutiveWarningList warnings={warnings} />
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Critical incidents" value={String(m.criticalIncidents)} />
        <MetricCard label="Open incidents" value={String(m.openIncidents)} />
        <MetricCard label="Resolved today" value={String(m.resolvedToday)} />
        <MetricCard label="Platform health" value={`${m.platformHealth}%`} />
        <MetricCard label="Workflow success" value={m.workflowSuccessRate != null ? `${m.workflowSuccessRate}%` : "—"} />
        <MetricCard label="Automation success" value={m.automationSuccessRate != null ? `${m.automationSuccessRate}%` : "—"} />
        <MetricCard label="Predicted issues" value={String(m.predictedIssues)} />
        <MetricCard label="Recruiter workload" value={String(m.recruiterWorkload)} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-300">Engine monitoring</h3>
          <ul className="mt-3 space-y-2">
            {dashboard.engineMonitoring.map((engine) => (
              <li key={engine.engineId} className="rounded-xl border border-zinc-800/35 bg-zinc-950/30 px-3.5 py-2.5 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-zinc-200">{engine.label}</span>
                  <StatusBadge tone={engine.status === "critical" ? "critical" : engine.status === "warning" ? "warning" : "success"}>
                    {engine.status}
                  </StatusBadge>
                </div>
                <p className="mt-1.5 leading-relaxed text-zinc-500">{engine.explanation}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-300">Executive recommendations</h3>
          <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-relaxed text-zinc-400">
            {dashboard.executiveRecommendations.map((rec) => (
              <li key={rec}>{rec}</li>
            ))}
          </ul>
          <h3 className="mt-5 text-sm font-semibold text-zinc-300">Predictive risks</h3>
          <ul className="mt-3 space-y-2">
            {dashboard.predictiveRisks.slice(0, 4).map((risk) => (
              <li key={risk.id} className="text-xs leading-relaxed text-zinc-400">
                <span className="font-medium text-zinc-200">{risk.label}</span> ({risk.likelihood}) — {risk.impact}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {dashboard.criticalAlerts.length > 0 ? (
        <div className="mt-6 overflow-x-auto">
          <h3 className="text-sm font-semibold text-zinc-300">Critical alerts</h3>
          <table className="mt-3 w-full min-w-[560px] text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800/50 text-zinc-500">
                <th className="pb-2 pr-3">Severity</th>
                <th className="pb-2 pr-3">Type</th>
                <th className="pb-2 pr-3">Engine</th>
                <th className="pb-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.criticalAlerts.slice(0, 8).map((issue) => (
                <tr key={issue.issueId} className="border-b border-zinc-800/40">
                  <td className="py-2 pr-3 text-zinc-200">{issue.severity}</td>
                  <td className="py-2 pr-3 text-zinc-400">{issue.issueType.replace(/_/g, " ")}</td>
                  <td className="py-2 pr-3 text-zinc-400">{issue.responsibleEngine}</td>
                  <td className="py-2 text-zinc-400">{issue.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </ExecutiveCard>
  );
}
