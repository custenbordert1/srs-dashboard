"use client";

import type { BreezyCandidate } from "@/lib/breezy-api";
import {
  buildBaselineWorkflowRow,
  buildScoredWorkflowRow,
  type ScoredCandidateWorkflowRow,
} from "@/lib/build-candidate-workflow-row";
import { defaultRecruiterRosters, type CandidateWorkflowState, type RecruiterRosters } from "@/lib/candidate-workflow-types";
import { pickActingRecruiter } from "@/lib/recruiter-roster";
import { RecruiterDashboardDailyPlan } from "@/components/recruiting/recruiter-dashboard/recruiter-dashboard-daily-plan";
import { RecruiterDashboardForecast } from "@/components/recruiting/recruiter-dashboard/recruiter-dashboard-forecast";
import { RecruiterDashboardPipeline } from "@/components/recruiting/recruiter-dashboard/recruiter-dashboard-pipeline";
import { RecruiterDashboardProductivity } from "@/components/recruiting/recruiter-dashboard/recruiter-dashboard-productivity";
import { RecruiterDashboardScorecard } from "@/components/recruiting/recruiter-dashboard/recruiter-dashboard-scorecard";
import { RecruiterDashboardToday } from "@/components/recruiting/recruiter-dashboard/recruiter-dashboard-today";
import { DashboardSectionFallback } from "@/components/ui/dashboard-section-fallback";
import { EXECUTIVE_PANEL_LOADING_CEILING_MS, useLoadingCeiling } from "@/hooks/use-loading-ceiling";
import { cacheKey, fetchCachedJson, LONG_CLIENT_CACHE_TTL_MS } from "@/lib/client-api-cache";
import { buildJobsByPositionId } from "@/lib/recruiting-intelligence";
import { buildRecruiterDashboardSnapshot } from "@/lib/recruiter-dashboard";
import { fetchCommandCenterBreezyData } from "@/lib/reliability/command-center-breezy";
import { useCallback, useEffect, useMemo, useState } from "react";

export function RecruiterDashboardSection() {
  const [candidates, setCandidates] = useState<BreezyCandidate[]>([]);
  const [enrichedCandidates, setEnrichedCandidates] = useState<ScoredCandidateWorkflowRow[]>([]);
  const [workflowState, setWorkflowState] = useState<CandidateWorkflowState>({});
  const [rosters, setRosters] = useState<RecruiterRosters>(() => defaultRecruiterRosters());
  const [actingRecruiter, setActingRecruiter] = useState(() => pickActingRecruiter(defaultRecruiterRosters()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobsByPositionId, setJobsByPositionId] = useState(() => new Map());
  const loadingCeilingHit = useLoadingCeiling(loading && candidates.length === 0, EXECUTIVE_PANEL_LOADING_CEILING_MS);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [breezy, workflowsResult] = await Promise.all([
        fetchCommandCenterBreezyData(),
        fetchCachedJson(
          cacheKey(["candidates", "workflows"]),
          async () => {
            const res = await fetch("/api/candidates/workflows", { cache: "no-store" });
            return (await res.json()) as {
              ok: boolean;
              workflows?: CandidateWorkflowState;
              rosters?: RecruiterRosters;
            };
          },
          { ttlMs: LONG_CLIENT_CACHE_TTL_MS, label: "candidate-workflows", staleOnError: true },
        ),
      ]);

      if (!breezy.candidates.ok) {
        throw new Error(breezy.candidates.error);
      }

      setCandidates(breezy.candidates.candidates);
      setJobsByPositionId(breezy.jobs.ok ? buildJobsByPositionId(breezy.jobs.jobs) : new Map());

      if (workflowsResult.ok && workflowsResult.workflows) {
        setWorkflowState(workflowsResult.workflows);
      }
      if (workflowsResult.ok && workflowsResult.rosters) {
        setRosters(workflowsResult.rosters);
        setActingRecruiter((current) =>
          workflowsResult.rosters!.recruiters.includes(current)
            ? current
            : pickActingRecruiter(workflowsResult.rosters!),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recruiter dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (candidates.length === 0) {
      setEnrichedCandidates([]);
      return;
    }
    const rows = candidates.map((candidate) =>
      buildScoredWorkflowRow(candidate, workflowState[candidate.candidateId], {
        job: jobsByPositionId.get(candidate.positionId),
      }),
    );
    setEnrichedCandidates(rows);
  }, [candidates, jobsByPositionId, workflowState]);

  const scoredRows = useMemo(() => {
    if (enrichedCandidates.length > 0) return enrichedCandidates;
    return candidates.map((candidate) =>
      buildBaselineWorkflowRow(candidate, workflowState[candidate.candidateId]),
    );
  }, [candidates, enrichedCandidates, workflowState]);

  const snapshot = useMemo(
    () =>
      buildRecruiterDashboardSnapshot({
        candidates: scoredRows,
        actingRecruiter,
      }),
    [actingRecruiter, scoredRows],
  );

  if (loading && candidates.length === 0) {
    return (
      <DashboardSectionFallback
        title="Recruiter Dashboard"
        loadingMessage="Loading your daily operating dashboard…"
        isLoading
        loadingCeilingHit={loadingCeilingHit}
        onRetry={() => void load()}
        skeletonRows={4}
        skeletonCards={4}
        friendlyContext="candidates"
      />
    );
  }

  if (error && candidates.length === 0) {
    return (
      <DashboardSectionFallback
        title="Recruiter Dashboard"
        error={error}
        onRetry={() => void load()}
        friendlyContext="candidates"
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-teal-500/25 bg-gradient-to-br from-teal-500/10 via-zinc-900/60 to-zinc-900/40 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-teal-300/90">
              Recruiter dashboard
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">Daily command center</h1>
            <p className="mt-1 text-sm text-zinc-400">
              What to do, who to call, who is blocked, and who is closest to hire.
            </p>
          </div>
          <label className="flex min-w-[12rem] flex-col gap-1 text-xs text-zinc-400">
            Acting recruiter
            <select
              value={actingRecruiter}
              onChange={(event) => setActingRecruiter(event.target.value)}
              className="rounded-lg border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100"
            >
              {rosters.recruiters.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <RecruiterDashboardDailyPlan actions={snapshot.dailyPlan} />
      <RecruiterDashboardToday items={snapshot.today} />
      <RecruiterDashboardPipeline cards={snapshot.pipeline} />
      <RecruiterDashboardProductivity productivity={snapshot.productivity} />
      <RecruiterDashboardForecast forecast={snapshot.forecast} />
      <RecruiterDashboardScorecard scorecard={snapshot.scorecard} />
    </div>
  );
}
