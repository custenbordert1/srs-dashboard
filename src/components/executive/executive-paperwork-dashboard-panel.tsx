"use client";

import type {
  ApprovalQueueRecruiterRollup,
  ExecutivePaperworkDashboard,
  ExecutivePaperworkCandidateRow,
  ExecutivePaperworkStageCard,
} from "@/lib/executive-paperwork-dashboard/types";
import { useCallback, useEffect, useMemo, useState } from "react";

type DashboardTab = "stages" | "drift";

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

function formatAge(hours: number | null): string {
  if (hours == null) return "—";
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

function formatTimestamp(iso: string | null | undefined): string {
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

function StageCard({
  stage,
  expanded,
  onToggle,
}: {
  stage: ExecutivePaperworkStageCard;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-900/50"
      >
        <div>
          <p className="text-sm font-medium text-zinc-100">{stage.label}</p>
          <p className="text-xs text-zinc-500">{stage.count.toLocaleString()} candidates</p>
        </div>
        <span className="text-2xl font-semibold tabular-nums text-zinc-50">{stage.count}</span>
      </button>
      {expanded && stage.rows.length > 0 ? (
        <div className="border-t border-zinc-800/80 px-2 pb-2">
          <CandidateTable rows={stage.rows} showDrift />
        </div>
      ) : null}
      {expanded && stage.rows.length === 0 ? (
        <p className="border-t border-zinc-800/80 px-4 py-3 text-xs text-zinc-500">No candidates in this stage.</p>
      ) : null}
    </div>
  );
}

function CandidateTable({
  rows,
  showDrift = false,
}: {
  rows: ExecutivePaperworkCandidateRow[];
  showDrift?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead>
          <tr className="text-zinc-500">
            <th className="px-2 py-2 font-medium">Candidate</th>
            <th className="px-2 py-2 font-medium">Recruiter</th>
            <th className="px-2 py-2 font-medium">Age</th>
            <th className="px-2 py-2 font-medium">Signature ID</th>
            {showDrift ? <th className="px-2 py-2 font-medium">Drift</th> : null}
            <th className="px-2 py-2 font-medium">Exception</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.candidateId} className="border-t border-zinc-800/60 text-zinc-200">
              <td className="px-2 py-2">
                <p className="font-medium text-zinc-100">{row.candidateName}</p>
                <p className="text-[10px] text-zinc-500">{row.candidateId}</p>
                {row.email ? <p className="text-[10px] text-zinc-500">{row.email}</p> : null}
              </td>
              <td className="px-2 py-2">{row.recruiter}</td>
              <td className="px-2 py-2 tabular-nums">{formatAge(row.ageInStageHours)}</td>
              <td className="max-w-[10rem] truncate px-2 py-2 font-mono text-[10px] text-zinc-400">
                {row.signatureRequestId ?? "—"}
              </td>
              {showDrift ? (
                <td className="px-2 py-2">
                  {row.hasDrift ? (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
                      {row.sourceOfTruth}
                    </span>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
              ) : null}
              <td className="max-w-[14rem] px-2 py-2 text-zinc-400">{row.exceptionReason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecruiterRollupTable({ rollup }: { rollup: ApprovalQueueRecruiterRollup[] }) {
  if (rollup.length === 0) return null;

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/30 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">Approval Queue · Recruiter rollup</h3>
      <p className="mt-1 text-xs text-zinc-500">Counts and oldest queue age by assigned recruiter</p>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead>
            <tr className="text-zinc-500">
              <th className="px-2 py-2 font-medium">Recruiter</th>
              <th className="px-2 py-2 font-medium">In queue</th>
              <th className="px-2 py-2 font-medium">Oldest</th>
            </tr>
          </thead>
          <tbody>
            {rollup.map((row) => (
              <tr key={row.recruiter} className="border-t border-zinc-800/60 text-zinc-200">
                <td className="px-2 py-2">{row.recruiter}</td>
                <td className="px-2 py-2 tabular-nums">{row.count}</td>
                <td className="px-2 py-2 tabular-nums">{formatAge(row.oldestAgeHours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ExecutivePaperworkDashboardPanel() {
  const [dashboard, setDashboard] = useState<ExecutivePaperworkDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<DashboardTab>("stages");
  const [expandedStage, setExpandedStage] = useState<string | null>("approvalQueue");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/candidates/paperwork/dashboard", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        dashboard?: ExecutivePaperworkDashboard;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.dashboard) {
        setError(data.error ?? "Failed to load executive paperwork dashboard");
        return;
      }
      setDashboard(data.dashboard);
    } catch {
      setError("Failed to load executive paperwork dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kpi = dashboard?.kpiStrip;
  const tabClass = useMemo(
    () => (active: DashboardTab) =>
      active === tab
        ? "rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-900"
        : "rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
    [tab],
  );

  if (loading && !dashboard) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-50">Executive Paperwork Dashboard</h2>
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-zinc-800/80" />
      </section>
    );
  }

  if (error && !dashboard) {
    return (
      <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-amber-100">Executive Paperwork Dashboard</h2>
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

  if (!dashboard || !kpi) return null;

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-50">Executive Paperwork Dashboard</h2>
          <p className="mt-1 text-sm text-zinc-400">
            MTD paperwork pipeline · read-only · approval{" "}
            {kpi.policyRequireApproval ? "required" : "not required"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Fetched {formatTimestamp(dashboard.fetchedAt)}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="MTD candidates" value={kpi.mtdCandidates.toLocaleString()} />
        <MetricCard label="In pipeline" value={kpi.inPipeline.toLocaleString()} />
        <MetricCard
          label="Approval queue"
          value={kpi.approvalQueue.toLocaleString()}
          alert={kpi.approvalQueue > 0}
        />
        <MetricCard label="Sent" value={kpi.sent.toLocaleString()} />
        <MetricCard label="Signed" value={kpi.signed.toLocaleString()} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Viewed" value={kpi.viewed.toLocaleString()} />
        <MetricCard label="Failed" value={kpi.failed.toLocaleString()} alert={kpi.failed > 0} />
        <MetricCard label="Expired" value={kpi.expired.toLocaleString()} />
        <MetricCard label="Awaiting recruiter" value={kpi.awaitingRecruiterAction.toLocaleString()} />
        <MetricCard label="Store drift" value={kpi.driftCount.toLocaleString()} alert={kpi.driftCount > 0} />
      </div>

      <div className="mt-4">
        <RecruiterRollupTable rollup={dashboard.approvalQueueRecruiterRollup} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={tabClass("stages")} onClick={() => setTab("stages")}>
          Stage cards
        </button>
        <button type="button" className={tabClass("drift")} onClick={() => setTab("drift")}>
          Drift ({kpi.driftCount})
        </button>
      </div>

      {tab === "stages" ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {dashboard.stages.map((stage) => (
            <StageCard
              key={stage.id}
              stage={stage}
              expanded={expandedStage === stage.id}
              onToggle={() => setExpandedStage((current) => (current === stage.id ? null : stage.id))}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-zinc-800/80 bg-zinc-950/30 p-2">
          {dashboard.driftRows.length === 0 ? (
            <p className="px-2 py-3 text-sm text-zinc-500">No workflow/onboarding drift detected.</p>
          ) : (
            <CandidateTable rows={dashboard.driftRows} />
          )}
          {dashboard.driftRows.length > 0 ? (
            <div className="mt-2 space-y-2 px-2 pb-2">
              {dashboard.driftRows.map((row) => (
                <p key={`${row.candidateId}-drift`} className="text-xs text-amber-100/90">
                  <span className="font-medium text-amber-100">{row.candidateName}</span>: {row.driftReason}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
