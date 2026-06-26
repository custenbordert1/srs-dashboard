"use client";

import type {
  AutonomousCandidateCommunicationDashboardSnapshot,
  CommunicationExecutionMode,
} from "@/lib/autonomous-candidate-communication-engine/types";
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

function modeTone(mode: CommunicationExecutionMode): string {
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

export function AutonomousCandidateCommunicationPanel() {
  const [dashboard, setDashboard] = useState<AutonomousCandidateCommunicationDashboardSnapshot | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/autonomous-candidate-communication", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        dashboard?: AutonomousCandidateCommunicationDashboardSnapshot;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.dashboard) {
        setError(data.error ?? "Failed to load communication preview");
        return;
      }
      setDashboard(data.dashboard);
      setWarnings(data.warnings ?? data.dashboard.warnings ?? []);
    } catch {
      setError("Failed to load communication preview");
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
        <h2 className="text-lg font-semibold text-zinc-50">Candidate Communication Engine</h2>
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-zinc-800/80" />
      </section>
    );
  }

  if (error && !dashboard) {
    return (
      <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-amber-100">Candidate Communication Engine</h2>
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

  const { controls, health } = dashboard;

  return (
    <section id="autonomous-candidate-communication" className="rounded-2xl border border-violet-500/30 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-50">Candidate Communication Engine</h2>
            <span className="rounded-full border border-violet-400/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
              Preview Mode
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            P73 communication layer · simulated delivery only · no live email or SMS
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${modeTone(controls.executionMode)}`}>
          Mode: {controls.executionMode}
        </span>
        <span className="rounded-full border border-zinc-700 bg-zinc-900/60 px-2.5 py-1 text-xs text-zinc-300">
          Status: {controls.communicationEnabled ? "ON" : "OFF"}
        </span>
        <span className="rounded-full border border-zinc-700 bg-zinc-900/60 px-2.5 py-1 text-xs text-zinc-300">
          Email: {controls.emailEnabled ? "Enabled" : "Disabled"}
        </span>
        <span className="rounded-full border border-zinc-700 bg-zinc-900/60 px-2.5 py-1 text-xs text-zinc-300">
          SMS: {controls.smsEnabled ? "Enabled" : "Disabled"}
        </span>
      </div>

      {warnings.length > 0 ? (
        <ul className="mt-4 space-y-1 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-100/90">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Communications today" value={String(health.communicationsToday)} />
        <MetricCard label="Queued" value={String(health.queued)} />
        <MetricCard label="Preview sent" value={String(health.previewSent)} />
        <MetricCard label="Waiting approval" value={String(health.waitingApproval)} />
        <MetricCard label="Failures" value={String(health.failures)} />
        <MetricCard label="Skipped" value={String(health.skipped)} />
        <MetricCard
          label="Automation %"
          value={health.automationPercent != null ? `${health.automationPercent}%` : "—"}
        />
        <MetricCard label="Templates used" value={String(health.templatesUsed)} />
        <MetricCard label="Work eliminated" value={String(health.recruiterWorkEliminated)} hint="Recruiter comms automated" />
      </div>

      {health.topCommunicationTypes.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-zinc-300">Top communication types</h3>
          <ul className="mt-2 space-y-1 text-sm text-zinc-400">
            {health.topCommunicationTypes.map((row) => (
              <li key={row.type} className="flex justify-between gap-3">
                <span>{row.type.replace(/_/g, " ")}</span>
                <span className="tabular-nums text-zinc-200">{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {dashboard.queue.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <h3 className="text-sm font-semibold text-zinc-300">Communication queue (preview)</h3>
          <table className="mt-2 w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500">
                <th className="pb-2 pr-3">Candidate</th>
                <th className="pb-2 pr-3">Type</th>
                <th className="pb-2 pr-3">Recipient</th>
                <th className="pb-2 pr-3">Status</th>
                <th className="pb-2">Subject</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.queue.slice(0, 8).map((item) => (
                <tr key={item.queueId} className="border-b border-zinc-800/60">
                  <td className="py-2 pr-3 text-zinc-200">{item.candidateName ?? "—"}</td>
                  <td className="py-2 pr-3 text-zinc-400">{item.communicationType.replace(/_/g, " ")}</td>
                  <td className="py-2 pr-3 text-zinc-400">{item.recipientLabel}</td>
                  <td className="py-2 pr-3 text-zinc-300">{item.status.replace(/_/g, " ")}</td>
                  <td className="py-2 text-zinc-400">{item.templateSubject}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {dashboard.sampleTimeline.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-zinc-300">Sample candidate timeline</h3>
          <ol className="mt-2 space-y-2 border-l border-violet-500/30 pl-4">
            {dashboard.sampleTimeline.map((step) => (
              <li key={step.id} className="text-xs text-zinc-400">
                <span className="font-medium text-zinc-200">{step.label}</span>
                {step.detail ? <span className="block text-zinc-500">{step.detail}</span> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <pre className="mt-4 max-h-40 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400 whitespace-pre-wrap">
        {dashboard.leadershipSummary}
      </pre>
    </section>
  );
}
