"use client";

import type { RecruiterReplacementReadiness } from "@/lib/recruiter-replacement-readiness/types";
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

export function RecruiterAutomationReadinessPanel() {
  const [readiness, setReadiness] = useState<RecruiterReplacementReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/candidates/readiness/health", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        readiness?: RecruiterReplacementReadiness;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.readiness) {
        setError(data.error ?? "Failed to load recruiter automation readiness");
        return;
      }
      setReadiness(data.readiness);
    } catch {
      setError("Failed to load recruiter automation readiness");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !readiness) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-50">Recruiter Automation Readiness</h2>
        <div className="mt-3 h-20 animate-pulse rounded-lg bg-zinc-800/80" />
      </section>
    );
  }

  if (error && !readiness) {
    return (
      <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-amber-100">Recruiter Automation Readiness</h2>
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

  if (!readiness) return null;

  const { audit, readinessScore, blockers, rootCause } = readiness;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Recruiter Automation Readiness</h2>
          <p className="mt-1 text-sm text-zinc-400">
            P65.4 funnel audit · {audit.totalCandidates} MTD candidates · paperwork eligible{" "}
            {readiness.paperworkEligible}
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

      <p className="mt-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-300">
        {rootCause.summary}
      </p>
      <p className="mt-2 text-xs text-zinc-500">
        Fix location: <span className="text-zinc-400">{rootCause.recommendedFixLocation}</span>
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Assignment readiness" value={`${readinessScore.assignmentReadinessPct}%`} />
        <MetricCard label="Action readiness" value={`${readinessScore.actionReadinessPct}%`} />
        <MetricCard label="Decision readiness" value={`${readinessScore.decisionReadinessPct}%`} />
        <MetricCard label="Execution readiness" value={`${readinessScore.executionReadinessPct}%`} />
        <MetricCard
          label="Paperwork readiness"
          value={`${readinessScore.paperworkReadinessPct}%`}
          alert={readinessScore.paperworkReadinessPct === 0}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          label="Blocked before assignment"
          value={blockers.blockedBeforeAssignment.toLocaleString()}
          alert={blockers.blockedBeforeAssignment > 0}
        />
        <MetricCard label="Blocked before P63" value={blockers.blockedBeforeP63.toLocaleString()} />
        <MetricCard label="Blocked before P64" value={blockers.blockedBeforeP64.toLocaleString()} />
        <MetricCard label="Blocked before P65.2" value={blockers.blockedBeforeP65_2.toLocaleString()} />
        <MetricCard label="Blocked before P65.3" value={blockers.blockedBeforeP65_3.toLocaleString()} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Recruiter assigned" value={audit.recruiterAssigned.toLocaleString()} />
        <MetricCard label="Recruiter unassigned" value={audit.recruiterUnassigned.toLocaleString()} />
        <MetricCard label="P63 actions" value={audit.p63ActionGenerated.toLocaleString()} />
        <MetricCard label="Missing actions" value={audit.missingAction.toLocaleString()} />
      </div>
    </section>
  );
}
