"use client";

import type { BreezyCandidatesResult, BreezyJobsResult } from "@/lib/breezy-api";
import { fetchCachedBreezyCandidates, fetchCachedBreezyJobs } from "@/lib/cached-breezy-client";
import {
  breezyDisconnectedDetail,
  breezyDisconnectedTitle,
  classifyBreezyError,
  type BreezyFailureKind,
} from "@/lib/breezy-error-ui";
import { buildCommandCenterDmInsights } from "@/lib/command-center-dm-insights";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import { DataTrustBadge, DataTrustStatusBanner } from "@/components/ui/data-trust-badge";
import { breezyAtsToDataTrustInput, buildBreezyAtsMetrics } from "@/lib/breezy-ats-metrics";
import { BreezyAtsSyncStatus } from "@/components/recruiting/breezy-ats-sync-status";
import { buildDataTrustState, type DataTrustState } from "@/lib/data-trust-state";
import { fetchWithTimeout, FETCH_T4_INTELLIGENCE_MS } from "@/lib/fetch-with-timeout";
import {
  buildRecruitingCommandCenter,
  formatCommandCenterSyncTime,
} from "@/lib/recruiting-command-center";
import { CommandCenterDmInsights } from "@/components/recruiting/command-center-dm-insights";
import { NotificationCriticalAlertsPanel } from "@/components/notifications/notification-critical-alerts-panel";
import { DashboardSectionFallback } from "@/components/ui/dashboard-section-fallback";
import { useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import { useCallback, useEffect, useMemo, useState } from "react";
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
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <p className="text-sm text-zinc-500">Loading Command Center from Breezy (jobs and candidates)…</p>
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
  fromCache,
  stale,
  errorMessage,
  failureKind,
}: {
  connected: boolean;
  lastSyncLabel: string;
  partialPositionSync: boolean;
  fromCache?: boolean;
  stale?: boolean;
  errorMessage?: string;
  failureKind?: BreezyFailureKind;
}) {
  if (!connected) {
    const kind = failureKind ?? classifyBreezyError(errorMessage ?? "");
    const title = breezyDisconnectedTitle(kind);
    const detail = breezyDisconnectedDetail(errorMessage ?? "", kind);

    return (
      <div
        role="alert"
        className="flex flex-col gap-2 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="text-sm font-semibold text-red-100">{title}</p>
          <p className="mt-0.5 text-sm text-red-200/80">{detail}</p>
          {kind === "missing_config" ? (
            <p className="mt-2 text-xs text-red-200/70">
              Paste <code className="rounded bg-red-950/60 px-1 py-0.5">BREEZY_API_KEY</code> from your old Mac
              into <code className="rounded bg-red-950/60 px-1 py-0.5">.env.local</code>, then restart{" "}
              <code className="rounded bg-red-950/60 px-1 py-0.5">npm run dev</code>.
            </p>
          ) : null}
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
      {stale ? (
        <p className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100">
          Showing cached snapshot while live refresh recovers.
        </p>
      ) : fromCache ? (
        <p className="rounded-lg border border-sky-500/35 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-100">
          Loaded from recent cache.
        </p>
      ) : null}
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


type CommandCenterExtras = {
  coverage: CoverageRiskSnapshot | null;
  workflows: CandidateWorkflowState | null;
};

export function RecruitingCommandCenter() {
  const [loadState, setLoadState] = useState<CommandCenterLoadState>({ status: "loading" });
  const [extras, setExtras] = useState<CommandCenterExtras | null>(null);
  const [extrasLoading, setExtrasLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const loadingCeilingHit = useLoadingCeiling(loadState.status === "loading");
  const breezyCandidates =
    loadState.status === "ready" && loadState.candidates.ok ? loadState.candidates.candidates : [];
  const drawer = useCandidateDrawer({ candidates: breezyCandidates });

  const load = useCallback(async () => {
    setLoadState({ status: "loading" });
    try {
      const [candidates, jobs] = await Promise.all([
        fetchCachedBreezyCandidates(),
        fetchCachedBreezyJobs(),
      ]);
      setLoadState({ status: "ready", candidates, jobs });
    } catch (err) {
      setLoadState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to load Breezy recruiting data",
      });
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const retry = useCallback(() => {
    setRetrying(true);
    void load().finally(() => setRetrying(false));
  }, [load]);

  const snapshot = useMemo(() => {
    if (loadState.status !== "ready") return null;
    if (!loadState.candidates.ok || !loadState.jobs.ok) return null;
    return buildRecruitingCommandCenter(loadState.candidates, loadState.jobs);
  }, [loadState]);

  useEffect(() => {
    if (loadState.status !== "ready" || !loadState.candidates.ok || !loadState.jobs.ok) {
      setExtras(null);
      return;
    }

    let cancelled = false;
    setExtrasLoading(true);

    void (async () => {
      try {
        const [coverageRes, workflowsRes] = await Promise.all([
          fetchWithTimeout("/api/coverage-risk", {
            cache: "no-store",
            timeoutMs: FETCH_T4_INTELLIGENCE_MS,
          }),
          fetchWithTimeout("/api/candidates/workflows", {
            cache: "no-store",
            timeoutMs: FETCH_T4_INTELLIGENCE_MS,
          }),
        ]);

        const coverageJson = (await coverageRes.json()) as {
          ok?: boolean;
          snapshot?: CoverageRiskSnapshot;
        };
        const workflowsJson = (await workflowsRes.json()) as {
          ok?: boolean;
          workflows?: CandidateWorkflowState;
        };

        if (cancelled) return;
        setExtras({
          coverage: coverageJson.ok && coverageJson.snapshot ? coverageJson.snapshot : null,
          workflows: workflowsJson.ok && workflowsJson.workflows ? workflowsJson.workflows : null,
        });
      } catch {
        if (!cancelled) {
          setExtras({ coverage: null, workflows: null });
        }
      } finally {
        if (!cancelled) setExtrasLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadState]);

  const dmInsights = useMemo(() => {
    if (loadState.status !== "ready" || !snapshot || !loadState.candidates.ok || !loadState.jobs.ok) {
      return null;
    }
    return buildCommandCenterDmInsights({
      jobs: loadState.jobs.jobs,
      candidates: loadState.candidates.candidates,
      fetchedAt: loadState.candidates.fetchedAt,
      coverage: extras?.coverage ?? null,
      workflows: extras?.workflows ?? null,
      commandCenter: snapshot,
    });
  }, [extras, loadState, snapshot]);

  const atsMetrics = useMemo(() => {
    if (loadState.status !== "ready" || !loadState.candidates.ok || !loadState.jobs.ok) return null;
    return buildBreezyAtsMetrics(loadState.candidates, loadState.jobs);
  }, [loadState]);

  const breezyTrustInput = useMemo(() => {
    if (atsMetrics) {
      return breezyAtsToDataTrustInput(atsMetrics);
    }
    if (loadState.status !== "ready" || !loadState.candidates.ok) return null;
    const candidates = loadState.candidates;
    return {
      hasData: Boolean(snapshot),
      partialSync: snapshot?.partialPositionSync,
      truncated: candidates.truncated,
      scanMode: candidates.scanMode,
      positionsScanned: candidates.positionsScanned,
      totalPositionsAvailable: candidates.totalPositionsAvailable,
      fromCache: candidates.fromCache,
      stale: candidates.stale,
    };
  }, [atsMetrics, loadState, snapshot]);

  const breezyTrustState: DataTrustState = useMemo(
    () => buildDataTrustState(breezyTrustInput ?? { hasData: Boolean(snapshot) }),
    [breezyTrustInput, snapshot],
  );

  if (loadState.status === "loading") {
    if (loadingCeilingHit) {
      return (
        <DashboardSectionFallback
          title="Recruiting Command Center"
          loadingCeilingHit
          error="Breezy sync is taking longer than expected."
          timedOut
          onRetry={retry}
          retrying={retrying}
        />
      );
    }
    return <CommandCenterSkeleton />;
  }

  if (loadState.status === "error") {
    const failureKind = classifyBreezyError(loadState.message);
    return (
      <SyncStatusBanner
        connected={false}
        lastSyncLabel="—"
        partialPositionSync={false}
        errorMessage={loadState.message}
        failureKind={failureKind}
      />
    );
  }

  if (!loadState.candidates.ok || !loadState.jobs.ok) {
    const errorMessage = !loadState.candidates.ok
      ? loadState.candidates.error
      : loadState.jobs.ok
        ? "Breezy jobs request failed"
        : loadState.jobs.error;
    const failureKind = classifyBreezyError(errorMessage);
    return (
      <SyncStatusBanner
        connected={false}
        lastSyncLabel={formatCommandCenterSyncTime(
          !loadState.candidates.ok ? loadState.candidates.fetchedAt : loadState.jobs.fetchedAt,
        )}
        partialPositionSync={false}
        errorMessage={errorMessage}
        failureKind={failureKind}
      />
    );
  }

  if (!snapshot) {
    return (
      <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-zinc-50">Recruiting Command Center</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Breezy connected but no KPI snapshot could be built from the latest sync. Try Refresh on Data Health or
          switch tabs and return.
        </p>
      </section>
    );
  }

  const [applied, interviewing, hired] = snapshot.funnel.map((row) => row.value);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Recruiting Command Center</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-500">
            Executive view of live Breezy hiring activity — jobs, applicants, funnel health, and source performance.
            Last sync: {snapshot.lastSyncLabel}.
          </p>
        </div>
        {breezyTrustInput ? <DataTrustBadge trust={breezyTrustInput} showHint /> : null}
      </header>

      {breezyTrustInput ? <DataTrustStatusBanner trust={breezyTrustInput} /> : null}

      {atsMetrics ? <BreezyAtsSyncStatus metrics={atsMetrics} compact={atsMetrics.syncTier === "full"} /> : null}

      <KpiCards
        items={snapshot.kpis}
        gridClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        trustCategory="command-center"
        trustState={breezyTrustState}
        trustInput={breezyTrustInput ?? undefined}
      />

      <NotificationCriticalAlertsPanel compact />

      {dmInsights ? (
        <CommandCenterDmInsights
          insights={dmInsights}
          loadingExtras={extrasLoading}
          territoryTrust={
            breezyTrustInput
              ? {
                  ...breezyTrustInput,
                  loading: extrasLoading,
                }
              : null
          }
          territoryTrustState={breezyTrustState}
        />
      ) : null}

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
