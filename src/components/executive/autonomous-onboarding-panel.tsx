"use client";

import type { AutonomousOnboardingDashboardSnapshot } from "@/lib/autonomous-onboarding-engine";
import { stateLabel } from "@/lib/autonomous-onboarding-engine";
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

function stallTone(level: string): string {
  switch (level) {
    case "blocked":
      return "border-rose-500/40 bg-rose-500/10 text-rose-100";
    case "high_risk":
      return "border-amber-500/40 bg-amber-500/10 text-amber-100";
    case "needs_attention":
      return "border-yellow-500/35 bg-yellow-500/10 text-yellow-100";
    default:
      return "border-zinc-700 bg-zinc-900/60 text-zinc-300";
  }
}

export function AutonomousOnboardingPanel() {
  const [dashboard, setDashboard] = useState<AutonomousOnboardingDashboardSnapshot | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/autonomous-onboarding", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        dashboard?: AutonomousOnboardingDashboardSnapshot;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.dashboard) {
        setError(data.error ?? "Failed to load autonomous onboarding preview");
        return;
      }
      setDashboard(data.dashboard);
      setWarnings(data.warnings ?? []);
    } catch {
      setError("Failed to load autonomous onboarding preview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sample = dashboard?.sampleCandidateId
    ? dashboard.candidates.find((row) => row.candidateId === dashboard.sampleCandidateId)
    : dashboard?.candidates[0];

  if (loading && !dashboard) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-50">Autonomous Onboarding Engine</h2>
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-zinc-800/80" />
      </section>
    );
  }

  if (error && !dashboard) {
    return (
      <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-amber-100">Autonomous Onboarding Engine</h2>
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

  const metrics = dashboard.progressMetrics;

  return (
    <section className="rounded-2xl border border-violet-500/30 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-50">Autonomous Onboarding Engine</h2>
            <span className="rounded-full border border-violet-400/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">
              Preview Mode
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            P67.1 progress & activity intelligence · read-only · no emails sent · no production writes
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
        <ul className="mt-3 space-y-1 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-xs text-violet-100/90">
          {warnings.map((warning) => (
            <li key={warning}>• {warning}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total onboarding" value={metrics.totalOnboarding.toLocaleString()} />
        <MetricCard label="Average progress" value={`${metrics.averageProgressPct}%`} />
        <MetricCard
          label="Avg time between steps"
          value={metrics.averageTimeBetweenStepsHours != null ? `${metrics.averageTimeBetweenStepsHours}h` : "—"}
        />
        <MetricCard label="Candidates waiting" value={metrics.candidatesWaiting.toLocaleString()} />
        <MetricCard label="Candidates blocked" value={metrics.candidatesBlocked.toLocaleString()} />
        <MetricCard label="Ready for work today" value={metrics.readyForWorkToday.toLocaleString()} />
        <MetricCard
          label="Avg days to ready"
          value={metrics.averageDaysToReady != null ? `${metrics.averageDaysToReady}` : "—"}
        />
        <MetricCard label="Stalled / at risk" value={dashboard.stalledCandidates.length.toLocaleString()} />
      </div>

      {dashboard.stalledCandidates.length > 0 ? (
        <div className="mt-5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Stalled candidates</p>
          <ul className="mt-2 space-y-2">
            {dashboard.stalledCandidates.slice(0, 6).map((row) => (
              <li
                key={row.candidateId}
                className={`rounded-lg border px-3 py-2 text-xs ${stallTone(row.stall.level)}`}
              >
                <span className="font-medium">{row.candidateName}</span> — {row.stall.label}: {row.stall.reason}
                {row.lastActivity ? (
                  <span className="mt-1 block text-[11px] opacity-80">
                    Last: {row.lastActivity.label} · {row.lastActivity.elapsedLabel} · {row.progressPercent}%
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {sample ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Sample candidate</p>
            <p className="mt-1 text-sm font-medium text-zinc-100">{sample.candidateName}</p>
            <p className="mt-2 font-mono text-xs tracking-widest text-violet-200">{sample.progress.progressBar}</p>
            <p className="mt-1 text-xs text-zinc-400">
              {sample.progress.progressPercent}% complete · {sample.progress.completedCount} of{" "}
              {sample.progress.totalSteps} steps
            </p>
            {sample.lastActivity ? (
              <p className="mt-2 text-xs text-zinc-300">
                Last activity: {sample.lastActivity.label} · {sample.lastActivity.elapsedLabel}
              </p>
            ) : null}
            <div className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Activity timeline</p>
              <ul className="mt-2 space-y-1 text-xs text-zinc-300">
                {sample.activityTimeline.slice(-5).map((entry) => (
                  <li key={entry.id}>
                    {entry.status === "completed" ? "✓" : "→"} {entry.label}
                    {entry.at ? ` · ${new Date(entry.at).toLocaleString()}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {sample.welcomeEmail ? (
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Welcome email preview</p>
              <p className="mt-1 text-xs font-medium text-teal-200">{sample.welcomeEmail.subject}</p>
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-[11px] leading-relaxed text-zinc-300">
                {sample.welcomeEmail.bodyText}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">State distribution</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.entries(dashboard.stateDistribution).map(([state, count]) => (
            <span
              key={state}
              className="rounded-full border border-zinc-700 bg-zinc-900/60 px-2.5 py-1 text-xs text-zinc-300"
            >
              {stateLabel(state as import("@/lib/autonomous-onboarding-engine").AutonomousOnboardingState)}: {count}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
