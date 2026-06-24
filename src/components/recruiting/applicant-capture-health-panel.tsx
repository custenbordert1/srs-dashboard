"use client";

import type { ApplicantCaptureHealth } from "@/lib/candidate-ingestion/types";
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

export function ApplicantCaptureHealthPanel() {
  const [health, setHealth] = useState<ApplicantCaptureHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/candidates/ingestion/health?reference_mtd=102", {
        cache: "no-store",
      });
      const data = (await res.json()) as { ok?: boolean; health?: ApplicantCaptureHealth; error?: string };
      if (!res.ok || !data.ok || !data.health) {
        setError(data.error ?? "Failed to load capture health");
        return;
      }
      setHealth(data.health);
    } catch {
      setError("Failed to load capture health");
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
        <h2 className="text-lg font-semibold text-zinc-50">Applicant Capture Health</h2>
        <div className="mt-3 h-20 animate-pulse rounded-lg bg-zinc-800/80" />
      </section>
    );
  }

  if (error && !health) {
    return (
      <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-amber-100">Applicant Capture Health</h2>
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

  const workflowAlert = health.workflowCoveragePct < 95;
  const p62Alert = health.p62CoveragePct < 85;
  const p63Alert = health.p63CoveragePct < 85;
  const p64Alert = health.p64CoveragePct < 85;
  const p62SkipHint =
    health.p62SkippedBelowConfidence > 0 || health.p62SkippedNoTerritory > 0
      ? `${health.p62SkippedBelowConfidence} below confidence · ${health.p62SkippedNoTerritory} no territory`
      : `${health.p62EligibleMtd} eligible MTD`;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Applicant Capture Health</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Durable full-position ingestion · {health.cycleComplete ? "cycle complete" : "sync in progress"}
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
          label="Total ingested"
          value={health.ingestionCandidateTotal.toLocaleString()}
          hint="All applicants in durable store"
        />
        <MetricCard
          label="MTD ingested"
          value={health.osApplicantsMtd.toLocaleString()}
          hint={`${health.captureRatePct}% capture vs Breezy ref`}
        />
        <MetricCard
          label="Workflow coverage"
          value={`${health.workflowCoveragePct}%`}
          hint={`${health.missingWorkflowRecords} missing records`}
          alert={workflowAlert}
        />
        <MetricCard
          label="Position coverage"
          value={`${health.positionCoveragePct}%`}
          hint={`${health.unscannedPositions} unscanned`}
        />
        <MetricCard
          label="P62 coverage"
          value={`${health.p62CoveragePct}%`}
          hint={p62SkipHint}
          alert={p62Alert}
        />
        <MetricCard
          label="P63 coverage"
          value={`${health.p63CoveragePct}%`}
          hint={`${health.p63EligibleMtd} assigned MTD`}
          alert={p63Alert}
        />
        <MetricCard
          label="P64 coverage"
          value={`${health.p64CoveragePct}%`}
          hint={`${health.p64EligibleMtd} eligible MTD`}
          alert={p64Alert}
        />
        <MetricCard
          label="Unassigned MTD"
          value={health.unassignedApplicants.toLocaleString()}
          hint={`${health.withoutP63} without P63 · ${health.withoutP64} without P64`}
        />
      </div>
    </section>
  );
}
