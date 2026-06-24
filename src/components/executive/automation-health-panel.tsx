"use client";

import type { CandidateAutomationHealth } from "@/lib/candidate-automation-engine/types";
import { useCallback, useEffect, useState } from "react";

function MetricCard({
  label,
  value,
  hint,
  alert,
  disabled,
}: {
  label: string;
  value: string;
  hint?: string;
  alert?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        disabled
          ? "border-zinc-800/50 bg-zinc-950/30 opacity-60"
          : alert
            ? "border-amber-500/40 bg-amber-500/5"
            : "border-zinc-800/80 bg-zinc-900/40"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          disabled ? "text-zinc-500" : alert ? "text-amber-200" : "text-zinc-50"
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function AutomationHealthPanel() {
  const [health, setHealth] = useState<CandidateAutomationHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/candidates/automation/health", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        health?: CandidateAutomationHealth;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.health) {
        setError(data.error ?? "Failed to load automation health");
        return;
      }
      setHealth(data.health);
    } catch {
      setError("Failed to load automation health");
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
        <h2 className="text-lg font-semibold text-zinc-50">Automation Performance</h2>
        <div className="mt-3 h-20 animate-pulse rounded-lg bg-zinc-800/80" />
      </section>
    );
  }

  if (error && !health) {
    return (
      <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-amber-100">Automation Performance</h2>
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

  const modeLabel =
    health.policyPaused ? "Paused" : health.policyMode.replace("-", " ");
  const p62Alert = health.p62CoveragePct < 85;
  const p63Alert = health.p63CoveragePct < 85;
  const p64Alert = health.p64CoveragePct < 85;
  const runAlert = health.runSuccessRatePct < 90;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Automation Performance</h2>
          <p className="mt-1 text-sm text-zinc-400">
            P65 orchestrator · {modeLabel}
            {health.lastTrigger ? ` · last ${health.lastTrigger}` : ""}
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
          label="Policy mode"
          value={modeLabel}
          hint={health.policyPaused ? "Automation paused" : "Decision layer active"}
        />
        <MetricCard
          label="Last run"
          value={formatTimestamp(health.lastRunAt)}
          hint={health.lastRunOk === false ? "Last run failed" : health.lastRunOk ? "Succeeded" : "No runs yet"}
          alert={health.lastRunOk === false}
        />
        <MetricCard
          label="Run success rate"
          value={`${health.runSuccessRatePct}%`}
          hint={`${health.totalRuns} total · ${health.failedRuns} failed`}
          alert={runAlert && health.totalRuns > 0}
        />
        <MetricCard
          label="MTD processed"
          value={health.mtdCandidatesProcessed.toLocaleString()}
          hint="Candidates in last orchestrator run"
        />
        <MetricCard
          label="P62 coverage"
          value={`${health.p62CoveragePct}%`}
          hint="Recruiter assignment"
          alert={p62Alert}
        />
        <MetricCard
          label="P63 coverage"
          value={`${health.p63CoveragePct}%`}
          hint="Recruiter actions"
          alert={p63Alert}
        />
        <MetricCard
          label="P64 coverage"
          value={`${health.p64CoveragePct}%`}
          hint="Stage progression"
          alert={p64Alert}
        />
        <MetricCard
          label="Automation completion"
          value={`${health.automationCompletionPct}%`}
          hint={`${health.manualInterventionRequired} need manual touch`}
        />
        <MetricCard
          label="Auto-assigned"
          value={health.candidatesAutoAssigned.toLocaleString()}
          hint="Recruiter elimination metric"
        />
        <MetricCard
          label="Auto-actioned"
          value={health.candidatesAutoActioned.toLocaleString()}
          hint="Engine-generated actions"
        />
        <MetricCard
          label="Auto-progressed"
          value={health.candidatesAutoProgressed.toLocaleString()}
          hint="Stage recommendations applied"
        />
        <MetricCard label="Auto executions" value="—" hint="P65.2 — not enabled" disabled />
        <MetricCard label="Escalations" value="—" hint="P65.3 — not enabled" disabled />
        <MetricCard label="Rebalances" value="—" hint="P65.3 — not enabled" disabled />
      </div>
    </section>
  );
}
