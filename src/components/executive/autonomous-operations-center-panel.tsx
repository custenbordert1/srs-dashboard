"use client";

import type { OperationsDashboardSnapshot } from "@/lib/autonomous-operations-center/types";
import { useCallback, useEffect, useState } from "react";

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

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
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-50">Autonomous Operations Center</h2>
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-zinc-800/80" />
      </section>
    );
  }

  if (error && !dashboard) {
    return (
      <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-amber-100">Autonomous Operations Center</h2>
        <p className="mt-2 text-sm text-amber-100/90">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-3 rounded-lg border border-amber-400/40 px-3 py-1 text-xs font-medium text-amber-100 hover:bg-amber-500/20">
          Retry
        </button>
      </section>
    );
  }

  if (!dashboard) return null;

  const m = dashboard.executiveMetrics;

  return (
    <section className="rounded-2xl border border-rose-500/25 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-50">Autonomous Operations Center</h2>
            <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-200">
              Preview Mode
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-400">P75 platform monitoring · detect, explain, prioritize — no production actions</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-300">
        <span className={`font-semibold uppercase ${statusTone(dashboard.systemHealth.status)}`}>
          System: {dashboard.systemHealth.status}
        </span>
        <span>Platform health: {dashboard.platformHealth.overall}%</span>
        <span>Open incidents: {m.openIncidents}</span>
      </div>

      {warnings.length > 0 ? (
        <ul className="mt-4 space-y-1 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-100/90">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Critical incidents" value={String(m.criticalIncidents)} />
        <MetricCard label="Open incidents" value={String(m.openIncidents)} />
        <MetricCard label="Resolved today" value={String(m.resolvedToday)} />
        <MetricCard label="Platform health" value={`${m.platformHealth}%`} />
        <MetricCard label="Workflow success" value={m.workflowSuccessRate != null ? `${m.workflowSuccessRate}%` : "—"} />
        <MetricCard label="Automation success" value={m.automationSuccessRate != null ? `${m.automationSuccessRate}%` : "—"} />
        <MetricCard label="Predicted issues" value={String(m.predictedIssues)} />
        <MetricCard label="Recruiter workload" value={String(m.recruiterWorkload)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-300">Engine monitoring</h3>
          <ul className="mt-2 space-y-2">
            {dashboard.engineMonitoring.map((engine) => (
              <li key={engine.engineId} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-zinc-200">{engine.label}</span>
                  <span className={`font-semibold uppercase ${statusTone(engine.status)}`}>{engine.status}</span>
                </div>
                <p className="mt-1 text-zinc-500">{engine.explanation}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-300">Executive recommendations</h3>
          <ul className="mt-2 list-disc pl-4 text-xs text-zinc-400">
            {dashboard.executiveRecommendations.map((rec) => (
              <li key={rec}>{rec}</li>
            ))}
          </ul>
          <h3 className="mt-4 text-sm font-semibold text-zinc-300">Predictive risks</h3>
          <ul className="mt-2 space-y-2">
            {dashboard.predictiveRisks.slice(0, 4).map((risk) => (
              <li key={risk.id} className="text-xs text-zinc-400">
                <span className="font-medium text-zinc-200">{risk.label}</span> ({risk.likelihood}) — {risk.impact}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {dashboard.criticalAlerts.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <h3 className="text-sm font-semibold text-zinc-300">Critical alerts</h3>
          <table className="mt-2 w-full min-w-[560px] text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="pb-2 pr-3">Severity</th>
                <th className="pb-2 pr-3">Type</th>
                <th className="pb-2 pr-3">Engine</th>
                <th className="pb-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.criticalAlerts.slice(0, 8).map((issue) => (
                <tr key={issue.issueId} className="border-b border-zinc-800/60">
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
    </section>
  );
}
