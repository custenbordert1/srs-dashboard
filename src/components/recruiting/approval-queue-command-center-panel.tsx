"use client";

import type {
  ApprovalQueueCandidateRow,
  ApprovalQueueCommandCenter,
  ApprovalQueuePriority,
  ApprovalQueueRecruiterRollup,
} from "@/lib/approval-queue-command-center/types";
import { useCallback, useEffect, useMemo, useState } from "react";

type ViewTab = "queue" | "recruiters" | "executive";

const PRIORITY_STYLES: Record<ApprovalQueuePriority, string> = {
  high: "border-red-500/35 bg-red-500/10 text-red-100",
  medium: "border-amber-500/35 bg-amber-500/10 text-amber-100",
  low: "border-zinc-700 bg-zinc-900/40 text-zinc-300",
};

function MetricCard({
  label,
  value,
  hint,
  alert,
}: {
  label: string;
  value: string | number;
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
  return `${Math.round(hours / 24)}d`;
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

function ExceptionBadges({ flags }: { flags: ApprovalQueueCandidateRow["exceptionFlags"] }) {
  if (flags.length === 0) return <span className="text-zinc-600">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <span
          key={flag}
          className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-200"
        >
          {flag}
        </span>
      ))}
    </div>
  );
}

function CandidateTable({ rows }: { rows: ApprovalQueueCandidateRow[] }) {
  if (rows.length === 0) {
    return <p className="px-2 py-3 text-sm text-zinc-500">No candidates in this group.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-xs">
        <thead>
          <tr className="text-zinc-500">
            <th className="px-2 py-2 font-medium">Candidate</th>
            <th className="px-2 py-2 font-medium">Recruiter</th>
            <th className="px-2 py-2 font-medium">Position</th>
            <th className="px-2 py-2 font-medium">Grade</th>
            <th className="px-2 py-2 font-medium">Confidence</th>
            <th className="px-2 py-2 font-medium">Age</th>
            <th className="px-2 py-2 font-medium">Priority</th>
            <th className="px-2 py-2 font-medium">Exceptions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.candidateId} className="border-t border-zinc-800/60 text-zinc-200">
              <td className="px-2 py-2">
                <p className="font-medium text-zinc-100">{row.candidateName}</p>
                <p className="text-[10px] text-zinc-500">{row.candidateId}</p>
              </td>
              <td className="px-2 py-2">{row.recruiter}</td>
              <td className="max-w-[12rem] px-2 py-2 text-zinc-400">{row.positionName}</td>
              <td className="px-2 py-2 tabular-nums">{row.grade}</td>
              <td className="px-2 py-2 tabular-nums">{row.confidenceScore}</td>
              <td className="px-2 py-2 tabular-nums">{formatAge(row.queueAgeHours)}</td>
              <td className="px-2 py-2">
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_STYLES[row.priority]}`}
                >
                  {row.priority}
                </span>
              </td>
              <td className="px-2 py-2">
                <ExceptionBadges flags={row.exceptionFlags} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecruiterRollupTable({ rollup }: { rollup: ApprovalQueueRecruiterRollup[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-950/30 p-2">
      <table className="min-w-full text-left text-xs">
        <thead>
          <tr className="text-zinc-500">
            <th className="px-2 py-2 font-medium">Recruiter</th>
            <th className="px-2 py-2 font-medium">In queue</th>
            <th className="px-2 py-2 font-medium">Avg age</th>
            <th className="px-2 py-2 font-medium">High priority</th>
            <th className="px-2 py-2 font-medium">Oldest</th>
          </tr>
        </thead>
        <tbody>
          {rollup.map((row) => (
            <tr key={row.recruiter} className="border-t border-zinc-800/60 text-zinc-200">
              <td className="px-2 py-2">{row.recruiter}</td>
              <td className="px-2 py-2 tabular-nums">{row.queueCount}</td>
              <td className="px-2 py-2 tabular-nums">{formatAge(row.averageAgeHours)}</td>
              <td className="px-2 py-2 tabular-nums">{row.highPriorityCount}</td>
              <td className="px-2 py-2 tabular-nums">{formatAge(row.oldestAgeHours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ApprovalQueueCommandCenterPanel() {
  const [dashboard, setDashboard] = useState<ApprovalQueueCommandCenter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ViewTab>("queue");
  const [selectedRecruiter, setSelectedRecruiter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/candidates/approval-queue/dashboard", { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        dashboard?: ApprovalQueueCommandCenter;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.dashboard) {
        setError(data.error ?? "Failed to load approval queue command center");
        return;
      }
      setDashboard(data.dashboard);
    } catch {
      setError("Failed to load approval queue command center");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tabClass = useMemo(
    () => (active: ViewTab) =>
      active === tab
        ? "rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-900"
        : "rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
    [tab],
  );

  const queueRows = useMemo(() => {
    if (!dashboard) return [];
    if (!selectedRecruiter) {
      return [
        ...dashboard.highPriority,
        ...dashboard.mediumPriority,
        ...dashboard.lowPriority,
      ];
    }
    return (
      dashboard.candidatesByRecruiter.find((group) => group.recruiter === selectedRecruiter)?.candidates ??
      []
    );
  }, [dashboard, selectedRecruiter]);

  if (loading && !dashboard) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-50">Approval Queue Command Center</h2>
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-zinc-800/80" />
      </section>
    );
  }

  if (error && !dashboard) {
    return (
      <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-amber-100">Approval Queue Command Center</h2>
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

  const summary = dashboard.executiveSummary;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-50">Approval Queue Command Center</h2>
            <p className="mt-1 text-sm text-zinc-400">
              P66 read-only queue operations · visibility and prioritization only
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
          <MetricCard label="Total queue" value={summary.totalQueue.toLocaleString()} alert={summary.totalQueue > 0} />
          <MetricCard label="High priority" value={summary.highPriorityCount.toLocaleString()} alert={summary.highPriorityCount > 0} />
          <MetricCard label="Medium priority" value={summary.mediumPriorityCount.toLocaleString()} />
          <MetricCard label="Low priority" value={summary.lowPriorityCount.toLocaleString()} />
          <MetricCard label="Recruiters" value={summary.byRecruiter.length.toLocaleString()} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={tabClass("queue")} onClick={() => setTab("queue")}>
            Prioritized queue
          </button>
          <button type="button" className={tabClass("recruiters")} onClick={() => setTab("recruiters")}>
            Recruiter rollups
          </button>
          <button type="button" className={tabClass("executive")} onClick={() => setTab("executive")}>
            Executive summary
          </button>
        </div>
      </div>

      {tab === "queue" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedRecruiter(null)}
              className={`rounded-lg border px-3 py-1 text-xs ${
                selectedRecruiter == null
                  ? "border-teal-500/40 bg-teal-500/10 text-teal-100"
                  : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              All recruiters
            </button>
            {dashboard.recruiterRollups.map((rollup) => (
              <button
                key={rollup.recruiter}
                type="button"
                onClick={() => setSelectedRecruiter(rollup.recruiter)}
                className={`rounded-lg border px-3 py-1 text-xs ${
                  selectedRecruiter === rollup.recruiter
                    ? "border-teal-500/40 bg-teal-500/10 text-teal-100"
                    : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {rollup.recruiter} ({rollup.queueCount})
              </button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-red-500/25 bg-zinc-950/30 p-2 lg:col-span-1">
              <h3 className="px-2 py-2 text-sm font-semibold text-red-100">High priority ({dashboard.highPriority.length})</h3>
              <CandidateTable rows={dashboard.highPriority.filter((row) => !selectedRecruiter || row.recruiter === selectedRecruiter)} />
            </div>
            <div className="rounded-xl border border-amber-500/25 bg-zinc-950/30 p-2 lg:col-span-1">
              <h3 className="px-2 py-2 text-sm font-semibold text-amber-100">Medium priority ({dashboard.mediumPriority.length})</h3>
              <CandidateTable rows={dashboard.mediumPriority.filter((row) => !selectedRecruiter || row.recruiter === selectedRecruiter)} />
            </div>
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/30 p-2 lg:col-span-1">
              <h3 className="px-2 py-2 text-sm font-semibold text-zinc-100">Low priority ({dashboard.lowPriority.length})</h3>
              <CandidateTable rows={dashboard.lowPriority.filter((row) => !selectedRecruiter || row.recruiter === selectedRecruiter)} />
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/30 p-2">
            <h3 className="px-2 py-2 text-sm font-semibold text-zinc-100">
              Full queue{selectedRecruiter ? ` · ${selectedRecruiter}` : ""} ({queueRows.length})
            </h3>
            <CandidateTable rows={queueRows} />
          </div>
        </div>
      ) : null}

      {tab === "recruiters" ? (
        <div className="space-y-4">
          <RecruiterRollupTable rollup={dashboard.recruiterRollups} />
          {dashboard.candidatesByRecruiter.map((group) => (
            <div key={group.recruiter} className="rounded-xl border border-zinc-800/80 bg-zinc-950/30 p-2">
              <h3 className="px-2 py-2 text-sm font-semibold text-zinc-100">
                {group.recruiter} · {group.candidates.length} waiting
              </h3>
              <CandidateTable rows={group.candidates} />
            </div>
          ))}
        </div>
      ) : null}

      {tab === "executive" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {summary.agingBuckets.map((bucket) => (
              <MetricCard key={bucket.id} label={`Aging ${bucket.label}`} value={bucket.count} />
            ))}
          </div>

          <RecruiterRollupTable rollup={summary.byRecruiter} />

          {summary.bottlenecks.length > 0 ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <h3 className="text-sm font-semibold text-amber-100">Approval bottlenecks</h3>
              <ul className="mt-2 space-y-1 text-sm text-amber-100/90">
                {summary.bottlenecks.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-xl border border-zinc-800/80 bg-zinc-950/30 px-4 py-3 text-sm text-zinc-500">
              No major approval bottlenecks detected.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
