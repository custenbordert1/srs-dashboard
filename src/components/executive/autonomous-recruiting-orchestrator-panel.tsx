"use client";

import type { OrchestratorDashboardSnapshot } from "@/lib/autonomous-recruiting-orchestrator/types";
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

function healthTone(status: string): string {
  switch (status) {
    case "healthy":
      return "text-emerald-300";
    case "warning":
      return "text-amber-300";
    case "blocked":
      return "text-red-300";
    default:
      return "text-zinc-400";
  }
}

export function AutonomousRecruitingOrchestratorPanel() {
  const [dashboard, setDashboard] = useState<OrchestratorDashboardSnapshot | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/autonomous-recruiting-orchestrator", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        dashboard?: OrchestratorDashboardSnapshot;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.dashboard) {
        setError(data.error ?? "Failed to load orchestrator preview");
        return;
      }
      setDashboard(data.dashboard);
      setWarnings(data.warnings ?? data.dashboard.warnings ?? []);
    } catch {
      setError("Failed to load orchestrator preview");
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
        <h2 className="text-lg font-semibold text-zinc-50">Autonomous Recruiting Orchestrator</h2>
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-zinc-800/80" />
      </section>
    );
  }

  if (error && !dashboard) {
    return (
      <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-amber-100">Autonomous Recruiting Orchestrator</h2>
        <p className="mt-2 text-sm text-amber-100/90">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-3 rounded-lg border border-amber-400/40 px-3 py-1 text-xs font-medium text-amber-100 hover:bg-amber-500/20">
          Retry
        </button>
      </section>
    );
  }

  if (!dashboard) return null;

  const { controls, readinessScore, executiveMetrics, workflowHealth } = dashboard;

  return (
    <section className="rounded-2xl border border-cyan-500/30 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-50">Autonomous Recruiting Orchestrator</h2>
            <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-200">
              Preview Mode
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-400">P74 master workflow coordinator · coordinates P67–P73 · no production execution</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-zinc-700 bg-zinc-900/60 px-2.5 py-1 text-zinc-300">
          Status: {controls.orchestratorEnabled ? "ON" : "OFF"}
        </span>
        <span className="rounded-full border border-zinc-700 bg-zinc-900/60 px-2.5 py-1 text-zinc-300">
          Mode: {controls.executionMode}
        </span>
        <span className="rounded-full border border-zinc-700 bg-zinc-900/60 px-2.5 py-1 text-zinc-300">
          Readiness: {readinessScore.overall}%
        </span>
      </div>

      {warnings.length > 0 ? (
        <ul className="mt-4 space-y-1 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-100/90">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4">
        <h3 className="text-sm font-semibold text-zinc-300">Lifecycle flow</h3>
        <p className="mt-1 text-xs text-zinc-500">{dashboard.lifecycleFlow.join(" → ")}</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Workflow health" value={`${workflowHealth.healthy}/${workflowHealth.total}`} hint="Healthy workflows" />
        <MetricCard label="Automation %" value={`${dashboard.automationProgress.percent ?? 0}%`} />
        <MetricCard label="Awaiting action" value={String(executiveMetrics.candidatesAwaitingAction)} />
        <MetricCard label="Ready for automation" value={String(executiveMetrics.readyForExecution)} />
        <MetricCard label="Blocked" value={String(executiveMetrics.blockedWorkflows)} />
        <MetricCard label="Recruiter time saved" value={String(executiveMetrics.recruiterTimeSaved)} />
        <MetricCard label="Entering today" value={String(executiveMetrics.candidatesEnteringWorkflow)} />
        <MetricCard label="Completions" value={String(executiveMetrics.workflowCompletions)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-300">Cross-engine health</h3>
          <ul className="mt-2 space-y-2">
            {dashboard.engineHealth.map((engine) => (
              <li key={engine.engineId} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-zinc-200">{engine.label}</span>
                  <span className={`font-semibold uppercase ${healthTone(engine.status)}`}>{engine.status}</span>
                </div>
                <p className="mt-1 text-zinc-500">{engine.explanation}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-300">Automation readiness</h3>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-cyan-200">{readinessScore.overall}%</p>
          <p className="mt-1 text-xs text-zinc-400">{readinessScore.summary}</p>
          {readinessScore.improvements.length > 0 ? (
            <ul className="mt-2 list-disc pl-4 text-xs text-zinc-500">
              {readinessScore.improvements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {dashboard.candidatesByStage.some((b) => b.count > 0) ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-zinc-300">Candidates by stage</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {dashboard.candidatesByStage.filter((b) => b.count > 0).map((bucket) => (
              <span key={bucket.stage} className="rounded-full border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300">
                {bucket.label}: {bucket.count}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {dashboard.waitingHumanAction.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <h3 className="text-sm font-semibold text-zinc-300">Waiting human action</h3>
          <table className="mt-2 w-full min-w-[560px] text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="pb-2 pr-3">Candidate</th>
                <th className="pb-2 pr-3">Stage</th>
                <th className="pb-2 pr-3">Engine</th>
                <th className="pb-2">Next action</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.waitingHumanAction.slice(0, 6).map((row) => (
                <tr key={row.candidateId} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 text-zinc-200">{row.candidateName}</td>
                  <td className="py-2 pr-3 text-zinc-400">{row.workflowStage.replace(/_/g, " ")}</td>
                  <td className="py-2 pr-3 text-zinc-400">{row.responsibleEngine.replace(/_/g, " ")}</td>
                  <td className="py-2 text-zinc-400">{row.nextAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
