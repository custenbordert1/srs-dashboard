"use client";

import type { BreezyCandidatesResult, BreezyJobsResult } from "@/lib/breezy-api";
import { fetchCachedBreezyCandidates, fetchCachedBreezyJobs } from "@/lib/cached-breezy-client";
import {
  buildRecruitingCommandCenter,
  formatCommandCenterSyncTime,
} from "@/lib/recruiting-command-center";
import { useEffect, useMemo, useState } from "react";
import { CandidateDetailDrawer } from "@/components/recruiting/candidate-detail-drawer";
import { useCandidateDrawer } from "@/hooks/use-candidate-drawer";
import {
  RankedCandidatesTable,
  TopCandidatesWidget,
} from "./command-center-candidate-ranking";
import { IntelligenceBarChart } from "./intelligence-bar-chart";
import { KpiCards } from "./kpi-cards";

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


export function RecruitingCommandCenter() {
  const [loadState, setLoadState] = useState<CommandCenterLoadState>({ status: "loading" });
  const breezyCandidates =
    loadState.status === "ready" && loadState.candidates.ok ? loadState.candidates.candidates : [];
  const drawer = useCandidateDrawer({ candidates: breezyCandidates });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [candidates, jobs] = await Promise.all([
          fetchCachedBreezyCandidates(),
          fetchCachedBreezyJobs(),
        ]);
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

      <TopCandidatesWidget rows={snapshot.topCandidates} onCandidateClick={drawer.openCandidate} />

      <RankedCandidatesTable
        rows={snapshot.rankedCandidates}
        filterOptions={snapshot.filterOptions}
        onCandidateClick={drawer.openCandidate}
        selectedCandidateId={drawer.selectedCandidateId}
      />

      <CandidateDetailDrawer {...drawer.drawerProps} />
    </div>
  );
}
