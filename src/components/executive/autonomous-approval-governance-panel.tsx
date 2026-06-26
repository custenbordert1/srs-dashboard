"use client";

import type { GovernanceDashboardSnapshot } from "@/lib/autonomous-approval-governance/types";
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

function approvalLabel(level: string): string {
  return level.replace(/_/g, " ");
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

export function AutonomousApprovalGovernancePanel() {
  const [dashboard, setDashboard] = useState<GovernanceDashboardSnapshot | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/autonomous-approval-governance", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        dashboard?: GovernanceDashboardSnapshot;
        warnings?: string[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.dashboard) {
        setError(data.error ?? "Failed to load governance engine");
        return;
      }
      setDashboard(data.dashboard);
      setWarnings(data.warnings ?? data.dashboard.warnings ?? []);
    } catch {
      setError("Failed to load governance engine");
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
        <h2 className="text-lg font-semibold text-zinc-50">Autonomous Approval & Governance</h2>
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-zinc-800/80" />
      </section>
    );
  }

  if (error && !dashboard) {
    return (
      <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-amber-100">Autonomous Approval & Governance</h2>
        <p className="mt-2 text-sm text-amber-100/90">{error}</p>
        <button type="button" onClick={() => void load()} className="mt-3 rounded-lg border border-amber-400/40 px-3 py-1 text-xs font-medium text-amber-100 hover:bg-amber-500/20">
          Retry
        </button>
      </section>
    );
  }

  if (!dashboard) return null;

  const m = dashboard.executiveMetrics;
  const health = dashboard.governanceHealth;

  return (
    <section id="autonomous-approval-governance" className="rounded-2xl border border-teal-500/25 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-zinc-50">Autonomous Approval & Governance</h2>
            <span className="rounded-full border border-teal-400/40 bg-teal-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-200">
              Preview Mode
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-400">P77 governance · evaluate permissions — no approval mutations or execution</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-300">
        <span className={`font-semibold uppercase ${statusTone(health.status)}`}>Governance: {health.status}</span>
        <span>{health.summary}</span>
      </div>

      {warnings.length > 0 ? (
        <ul className="mt-4 space-y-1 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-100/90">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Reviewed" value={String(m.totalDecisionsReviewed)} />
        <MetricCard label="Auto approved" value={String(m.autoApproved)} />
        <MetricCard label="Recruiter approval" value={String(m.recruiterApprovalRequired)} />
        <MetricCard label="DM approval" value={String(m.dmApprovalRequired)} />
        <MetricCard label="Executive approval" value={String(m.executiveApprovalRequired)} />
        <MetricCard label="Blocked" value={String(m.blockedByPolicy)} />
        <MetricCard label="Pilot eligible" value={String(m.pilotEligibleActions)} />
        <MetricCard label="Hrs saved (est.)" value={String(m.estimatedRecruiterTimeSaved)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-zinc-300">Approval queue (preview)</h3>
          <ul className="mt-2 space-y-2">
            {dashboard.approvalQueue.slice(0, 6).map((item) => (
              <li key={item.decisionId} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-xs">
                <div className="font-medium text-zinc-200">{item.recommendedAction}</div>
                <p className="mt-1 text-zinc-500">{item.candidateName ?? "Platform"} · {approvalLabel(item.approvalLevel)}</p>
                <p className="mt-1 text-zinc-500">{item.reason}</p>
                <p className="mt-1 text-[10px] uppercase text-zinc-600">
                  {item.confidence}% confidence · saves ~{item.timeSavedMinutesIfApproved} min
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-zinc-300">Blocked by policy</h3>
          <ul className="mt-2 list-disc pl-4 text-xs text-zinc-400">
            {dashboard.blockedByPolicy.slice(0, 5).map((d) => (
              <li key={d.decisionId}>
                {d.decision} — {d.governanceReason}
              </li>
            ))}
          </ul>
          <h3 className="mt-4 text-sm font-semibold text-zinc-300">Policy registry</h3>
          <ul className="mt-2 space-y-1 text-xs text-zinc-500">
            {dashboard.policies.slice(0, 6).map((p) => (
              <li key={p.id}>
                <span className="text-zinc-300">{p.label}</span>
                {p.threshold ? ` (${p.threshold})` : ""}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
