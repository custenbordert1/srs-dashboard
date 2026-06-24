"use client";

import type { CandidateExecutionHealth } from "@/lib/candidate-automation-execution/types";
import { useCallback, useEffect, useState } from "react";

function MetricCard({
  label,
  value,
  hint,
  alert,
}: {
  label: string;
  value: string;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${alert ? "border-amber-500/40 bg-amber-500/5" : "border-zinc-800/80 bg-zinc-900/40"}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${alert ? "text-amber-200" : "text-zinc-50"}`}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

export function ExecutionHealthPanel() {
  const [health, setHealth] = useState<CandidateExecutionHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/candidates/automation/execution/health", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        health?: CandidateExecutionHealth;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.health) {
        setError(data.error ?? "Failed to load execution health");
        return;
      }
      setHealth(data.health);
    } catch {
      setError("Failed to load execution health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !health) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-50">Execution Health</h2>
        <div className="mt-3 h-20 animate-pulse rounded-lg bg-zinc-800/80" />
      </section>
    );
  }

  if (error && !health) {
    return (
      <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-amber-100">Execution Health</h2>
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

  if (!health) return null;

  const successAlert = health.successRatePct < 90 && health.totalExecutions > 0;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Execution Health</h2>
          <p className="mt-1 text-sm text-zinc-400">
            P65.2 execution · {health.policyEnabled ? health.policyMode : "disabled"}
            {health.dryRun ? " · dry run" : ""}
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
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Eligible executions"
          value={health.eligibleExecutions.toLocaleString()}
          hint={health.lastRunAt ? `Last run ${new Date(health.lastRunAt).toLocaleString()}` : "No runs yet"}
        />
        <MetricCard label="Executed" value={health.executed.toLocaleString()} hint="Completed in last run" />
        <MetricCard
          label="Blocked by policy"
          value={health.blockedByPolicy.toLocaleString()}
          hint={health.policyEnabled ? "Type disabled in policy" : "Execution disabled"}
        />
        <MetricCard
          label="Blocked by batch cap"
          value={health.blockedByBatchCap.toLocaleString()}
          hint={`Escalation cap ${health.maxEscalationsPerRun}/run`}
          alert={health.blockedByBatchCap > 0}
        />
        <MetricCard label="Executions today" value={health.executionsToday.toLocaleString()} />
        <MetricCard
          label="Success rate"
          value={`${health.successRatePct}%`}
          hint={`${health.completedExecutions} completed · ${health.failedExecutions} failed`}
          alert={successAlert}
        />
        <MetricCard label="Failed executions" value={health.failedExecutions.toLocaleString()} />
        <MetricCard label="Escalations created" value={health.escalationsCreated.toLocaleString()} />
        <MetricCard
          label="Avg completion time"
          value={formatDuration(health.averageCompletionMs)}
          hint="Completed executions only"
        />
        <MetricCard label="Retry volume" value={health.retryVolume.toLocaleString()} />
        <MetricCard
          label="Automation effectiveness"
          value={`${health.automationEffectivenessPct}%`}
          hint={`${health.pendingExecutions} pending`}
        />
        <MetricCard
          label="Policy"
          value={health.policyEnabled ? health.policyMode : "Disabled"}
          hint={`Paperwork ${health.paperworkEnabled ? "on" : "off"} · Escalation ${health.escalationEnabled ? "on" : "off"}${health.escalationRequireApproval ? " (approval)" : ""}`}
        />
      </div>
    </section>
  );
}
