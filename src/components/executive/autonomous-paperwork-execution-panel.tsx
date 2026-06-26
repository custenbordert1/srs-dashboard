"use client";

import type {
  AutonomousPaperworkExecutionDashboardSnapshot,
  PaperworkExecutionMode,
} from "@/lib/autonomous-paperwork-execution-engine/types";
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

function modeTone(mode: PaperworkExecutionMode): string {
  switch (mode) {
    case "production":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
    case "pilot":
      return "border-sky-500/35 bg-sky-500/10 text-sky-100";
    case "preview":
      return "border-amber-500/40 bg-amber-500/10 text-amber-100";
    default:
      return "border-zinc-700 bg-zinc-900/60 text-zinc-300";
  }
}

export function AutonomousPaperworkExecutionPanel() {
  const [dashboard, setDashboard] = useState<AutonomousPaperworkExecutionDashboardSnapshot | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/autonomous-paperwork-execution", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        dashboard?: AutonomousPaperworkExecutionDashboardSnapshot;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.dashboard) {
        setError(data.error ?? "Failed to load paperwork execution preview");
        return;
      }
      setDashboard(data.dashboard);
      setWarnings(data.warnings ?? data.dashboard.warnings ?? []);
    } catch {
      setError("Failed to load paperwork execution preview");
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
        <h2 className="text-lg font-semibold text-zinc-50">Autonomous Paperwork Execution</h2>
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-zinc-800/80" />
      </section>
    );
  }

  if (error && !dashboard) {
    return (
      <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-amber-100">Autonomous Paperwork Execution</h2>
        <p className="mt-2 text-sm text-amber-100/90">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-lg border border-amber-400/40 px-3 py-1 text-xs font-medium text-amber-100 hover:bg-amber-500/20"
        >
          Retry
        </button>
      </section>
    );
  }

  if (!dashboard) return null;

  const controls = dashboard.controls;
  const metrics = dashboard.executiveMetrics;

  return (
    <section className="rounded-2xl border border-orange-500/30 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-50">Autonomous Paperwork Execution</h2>
            <span className="rounded-full border border-orange-400/40 bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-200">
              P71 Controlled Automation
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            Production architecture with execution disabled by default · simulates full workflow in preview mode
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>

      {warnings.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2 text-xs text-orange-100/90">
          {warnings.map((warning) => (
            <li key={warning}>• {warning}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Automation control center</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <p className="text-[10px] uppercase text-zinc-500">Paperwork automation</p>
            <p className="mt-1 text-lg font-semibold text-zinc-50">
              {controls.automationEnabled ? "ON" : "OFF"}
            </p>
          </div>
          <div className={`rounded-lg border px-4 py-3 ${modeTone(controls.executionMode)}`}>
            <p className="text-[10px] uppercase opacity-80">Execution mode</p>
            <p className="mt-1 text-lg font-semibold capitalize">{controls.executionMode}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <p className="text-[10px] uppercase text-zinc-500">Dropbox execution</p>
            <p className="mt-1 text-lg font-semibold text-zinc-50">
              {controls.dropboxExecution ? "Enabled" : "Disabled"}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
            <p className="text-[10px] uppercase text-zinc-500">Can execute live</p>
            <p className="mt-1 text-lg font-semibold text-zinc-50">{controls.canExecute ? "Yes" : "No"}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-zinc-400">{controls.pilotSummary}</p>
      </div>

      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Executive paperwork metrics</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Auto sends today" value={metrics.autoSendsToday.toLocaleString()} />
          <MetricCard label="Manual sends today" value={metrics.manualSendsToday.toLocaleString()} />
          <MetricCard label="Waiting signature" value={metrics.waitingSignature.toLocaleString()} />
          <MetricCard label="Completed today" value={metrics.completedToday.toLocaleString()} />
          <MetricCard label="Failed today" value={metrics.failedToday.toLocaleString()} />
          <MetricCard
            label="Automation success %"
            value={metrics.automationSuccessPercent != null ? `${metrics.automationSuccessPercent}%` : "—"}
          />
          <MetricCard label="Retry count" value={metrics.retryCount.toLocaleString()} />
          <MetricCard label="Queue depth" value={metrics.queueDepth.toLocaleString()} />
          <MetricCard
            label="Recruiter time saved"
            value={
              metrics.recruiterTimeSavedMinutes != null
                ? `${metrics.recruiterTimeSavedMinutes} min`
                : "—"
            }
          />
          <MetricCard
            label="Failure rate"
            value={metrics.failureRate != null ? `${metrics.failureRate}%` : "—"}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Ready for execution ({dashboard.readyCandidates.length})
          </p>
          <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs text-zinc-300">
            {dashboard.readyCandidates.slice(0, 8).map((row) => (
              <li key={row.candidateId} className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2">
                {row.candidateId} · {row.effectiveExecutionMode}
              </li>
            ))}
            {dashboard.readyCandidates.length === 0 ? (
              <li className="text-zinc-500">No candidates ready for automatic execution.</li>
            ) : null}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Blocked / manual review ({dashboard.blockedCandidates.length})
          </p>
          <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs text-zinc-300">
            {dashboard.blockedCandidates.slice(0, 8).map((row) => (
              <li key={row.candidateId} className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2">
                <span className="font-medium">{row.candidateId}</span>
                <span className="mt-1 block text-[11px] text-amber-100/80">
                  {row.blockingReasons[0] ?? "Needs recruiter review"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {dashboard.executionQueue.length > 0 ? (
        <div className="mt-5 overflow-x-auto">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Execution queue</p>
          <table className="mt-2 w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase text-zinc-500">
                <th className="pb-2 pr-3">Candidate</th>
                <th className="pb-2 pr-3">Recruiter</th>
                <th className="pb-2 pr-3">Template</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2 pr-3">Mode</th>
                <th className="pb-2 pr-3">Attempts</th>
                <th className="pb-2">Would execute</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.executionQueue.slice(0, 12).map((row) => (
                <tr key={row.queueId} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 font-medium text-zinc-200">{row.candidateName}</td>
                  <td className="py-2 pr-3 text-zinc-300">{row.recruiter}</td>
                  <td className="py-2 pr-3 text-xs text-zinc-400">{row.templateLabel}</td>
                  <td className="py-2 pr-3 capitalize text-zinc-300">{row.status.replaceAll("_", " ")}</td>
                  <td className="py-2 pr-3 capitalize text-zinc-300">{row.effectiveMode}</td>
                  <td className="py-2 pr-3 tabular-nums text-zinc-300">
                    {row.attempts}/{row.maxAttempts}
                  </td>
                  <td className="py-2 text-zinc-300">{row.wouldExecute ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {dashboard.sampleTimeline.length > 0 ? (
        <div className="mt-5 rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Sample execution timeline</p>
          <ul className="mt-3 space-y-2">
            {dashboard.sampleTimeline.slice(-8).map((step) => (
              <li key={step.id} className="flex items-start gap-3 text-xs text-zinc-300">
                <span className="shrink-0 font-mono text-[10px] text-zinc-500">
                  {new Date(step.at).toLocaleTimeString()}
                </span>
                <span>
                  {step.label}
                  {step.detail ? <span className="block text-zinc-500">{step.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
