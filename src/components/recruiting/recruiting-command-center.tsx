"use client";

import type { BreezyCandidatesResult, BreezyJobsResult } from "@/lib/breezy-api";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import {
  buildRecruitingCommandCenter,
  formatCommandCenterSyncTime,
  type CommandCenterCandidateRow,
} from "@/lib/recruiting-command-center";
import { useEffect, useMemo, useState } from "react";
import { IntelligenceBarChart } from "./intelligence-bar-chart";
import { KpiCards } from "./kpi-cards";

type SortKey = keyof Pick<
  CommandCenterCandidateRow,
  "name" | "stage" | "source" | "position" | "location" | "appliedDate" | "aiScoreLabel"
>;

type CommandCenterLoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; candidates: BreezyCandidatesResult; jobs: BreezyJobsResult };

function CommandCenterSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="h-14 animate-pulse rounded-xl border border-zinc-800/80 bg-zinc-900/40" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 7 }, (_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-900/40"
          />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-56 animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-900/40" />
        <div className="h-56 animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-900/40" />
      </div>
      <div className="h-72 animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-900/40" />
    </div>
  );
}

function SyncStatusBanner({
  connected,
  lastSyncLabel,
  partialPositionSync,
  errorMessage,
}: {
  connected: boolean;
  lastSyncLabel: string;
  partialPositionSync: boolean;
  errorMessage?: string;
}) {
  if (!connected) {
    return (
      <div
        role="alert"
        className="flex flex-col gap-2 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="text-sm font-semibold text-red-100">Breezy disconnected</p>
          <p className="mt-0.5 text-sm text-red-200/80">{errorMessage ?? "Unable to load live Breezy data."}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="text-sm font-semibold text-teal-100">Breezy connected</p>
        <p className="mt-0.5 text-sm text-teal-200/80">Last successful sync: {lastSyncLabel}</p>
      </div>
      {partialPositionSync ? (
        <p className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100">
          Partial Breezy sync — more positions/candidates available.
        </p>
      ) : null}
    </div>
  );
}

function FunnelVisualization({ applied, interviewing, hired }: { applied: number; interviewing: number; hired: number }) {
  const total = Math.max(applied + interviewing + hired, 1);
  const stages = [
    { label: "Applied", value: applied, color: "bg-sky-500/80" },
    { label: "Interviewing", value: interviewing, color: "bg-violet-500/80" },
    { label: "Hired", value: hired, color: "bg-emerald-500/80" },
  ];

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 shadow-sm shadow-black/20 backdrop-blur-sm sm:p-5">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Candidate funnel</h2>
      <p className="mt-1 text-sm text-zinc-500">Applied → Interviewing → Hired (live Breezy stages)</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {stages.map((stage, index) => {
          const widthPercent = Math.max(12, Math.round((stage.value / total) * 100));
          return (
            <div key={stage.label} className="relative">
              {index < stages.length - 1 ? (
                <span
                  className="absolute -right-2 top-8 hidden text-zinc-600 sm:inline"
                  aria-hidden
                >
                  →
                </span>
              ) : null}
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{stage.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-50">{stage.value.toLocaleString()}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800/80">
                <div className={`h-full rounded-full ${stage.color}`} style={{ width: `${widthPercent}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <th className="px-4 py-3 font-medium sm:px-5">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 text-left uppercase tracking-wider hover:text-zinc-300"
      >
        {label}
        <span className="text-[10px] text-zinc-600">{active ? (direction === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

function RecentCandidatesTable({ rows }: { rows: CommandCenterCandidateRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("appliedDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "appliedDate" ? "desc" : "asc");
  }

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let left: string | number = "";
      let right: string | number = "";
      if (sortKey === "appliedDate") {
        left = new Date(a.appliedDate).getTime() || 0;
        right = new Date(b.appliedDate).getTime() || 0;
      } else if (sortKey === "aiScoreLabel") {
        left = a.aiScoreLabel;
        right = b.aiScoreLabel;
      } else {
        left = a[sortKey].toLowerCase();
        right = b[sortKey].toLowerCase();
      }
      if (left < right) return sortDirection === "asc" ? -1 : 1;
      if (left > right) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return copy;
  }, [rows, sortDirection, sortKey]);

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm shadow-black/20 backdrop-blur-sm">
      <div className="border-b border-zinc-800/80 px-4 py-4 sm:px-5">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-50">Recent candidates</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Newest applicants from Breezy. Aging: &lt;24h green · 24–72h yellow · &gt;72h red.
        </p>
      </div>
      {sortedRows.length === 0 ? (
        <p className="px-4 py-8 text-sm text-zinc-500 sm:px-5">No candidates in the current sync.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[960px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800/80 text-xs text-zinc-500">
                <SortableHeader label="Name" sortKey="name" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Stage" sortKey="stage" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Source" sortKey="source" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Position" sortKey="position" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="City/State" sortKey="location" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="Applied date" sortKey="appliedDate" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
                <SortableHeader label="AI score" sortKey="aiScoreLabel" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {sortedRows.map((row) => (
                <tr key={row.candidateId} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 font-medium text-zinc-100 sm:px-5">{row.name}</td>
                  <td className="px-4 py-3 text-zinc-300 sm:px-5">{row.stage}</td>
                  <td className="px-4 py-3 text-zinc-300 sm:px-5">{row.source}</td>
                  <td className="px-4 py-3 text-zinc-300 sm:px-5">{row.position}</td>
                  <td className="px-4 py-3 text-zinc-400 sm:px-5">{row.location}</td>
                  <td className={`px-4 py-3 sm:px-5 ${row.agingClassName}`}>
                    {row.appliedDateLabel}
                    {row.appliedHoursAgo !== null ? (
                      <span className="ml-1 text-[10px] text-zinc-600">({row.appliedHoursAgo}h)</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 sm:px-5">{row.aiScoreLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function RecruitingCommandCenter() {
  const [loadState, setLoadState] = useState<CommandCenterLoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [candidatesRes, jobsRes] = await Promise.all([
          fetchWithRetry("/api/breezy/candidates", { cache: "no-store" }),
          fetchWithRetry("/api/breezy/jobs", { cache: "no-store" }),
        ]);
        const candidates = (await candidatesRes.json()) as BreezyCandidatesResult;
        const jobs = (await jobsRes.json()) as BreezyJobsResult;
        if (!cancelled) setLoadState({ status: "ready", candidates, jobs });
      } catch (err) {
        if (!cancelled) {
          setLoadState({
            status: "error",
            message: err instanceof Error ? err.message : "Failed to load Breezy recruiting data",
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const snapshot = useMemo(() => {
    if (loadState.status !== "ready") return null;
    if (!loadState.candidates.ok || !loadState.jobs.ok) return null;
    return buildRecruitingCommandCenter(loadState.candidates, loadState.jobs);
  }, [loadState]);

  if (loadState.status === "loading") return <CommandCenterSkeleton />;

  if (loadState.status === "error") {
    return (
      <SyncStatusBanner
        connected={false}
        lastSyncLabel="—"
        partialPositionSync={false}
        errorMessage={loadState.message}
      />
    );
  }

  if (!loadState.candidates.ok || !loadState.jobs.ok) {
    const errorMessage = !loadState.candidates.ok
      ? loadState.candidates.error
      : loadState.jobs.ok
        ? "Breezy jobs request failed"
        : loadState.jobs.error;
    return (
      <SyncStatusBanner
        connected={false}
        lastSyncLabel={formatCommandCenterSyncTime(
          !loadState.candidates.ok ? loadState.candidates.fetchedAt : loadState.jobs.fetchedAt,
        )}
        partialPositionSync={false}
        errorMessage={errorMessage}
      />
    );
  }

  if (!snapshot) return null;

  const [applied, interviewing, hired] = snapshot.funnel.map((row) => row.value);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Recruiting Command Center</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">
          Executive view of live Breezy hiring activity — jobs, applicants, funnel health, and source performance.
        </p>
      </header>

      <SyncStatusBanner
        connected={snapshot.connected}
        lastSyncLabel={snapshot.lastSyncLabel}
        partialPositionSync={snapshot.partialPositionSync}
      />

      <KpiCards items={snapshot.kpis} gridClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" />

      <div className="grid gap-6 lg:grid-cols-2">
        <FunnelVisualization applied={applied} interviewing={interviewing} hired={hired} />
        <IntelligenceBarChart
          title="Source breakdown"
          subtitle="Tracked channels from live Breezy applicant sources"
          data={snapshot.sourceBreakdown}
          valueLabel="applicants"
          barClassName="bg-teal-500/80"
        />
      </div>

      <RecentCandidatesTable rows={snapshot.recentCandidates} />
    </div>
  );
}
