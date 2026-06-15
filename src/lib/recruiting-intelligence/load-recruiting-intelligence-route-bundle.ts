import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { filterStatesForSession } from "@/lib/auth/permissions";
import { isAdminRole } from "@/lib/auth/roles";
import type { AuthSession } from "@/lib/auth/types";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import type { BreezyApiFailure, BreezyCandidate, BreezyJob, BreezyCandidatesResult, BreezyJobsResult } from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { buildCoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import { getCachedRecruitingIntelligenceSnapshot } from "@/lib/recruiting-intelligence/recruiting-intelligence-cache";
import type { RecruitingIntelligenceCacheMeta } from "@/lib/recruiting-intelligence/recruiting-intelligence-types";

export type RecruitingIntelligenceRouteBundle = {
  jobs: BreezyJob[];
  jobsResult: Extract<BreezyJobsResult, { ok: true }>;
  candidates: BreezyCandidate[];
  workflows: CandidateWorkflowState;
  opportunities: MelOpportunity[];
  activeReps: ActiveRep[];
  coverage: CoverageRiskSnapshot;
  fetchedAt: string;
  candidatesResult: Extract<BreezyCandidatesResult, { ok: true }>;
  melOk: boolean;
  intelligenceCache: RecruitingIntelligenceCacheMeta;
};

export type LoadRecruitingIntelligenceRouteBundleOptions = {
  forceRefresh?: boolean;
  unscopedForAdmin?: boolean;
  territoryStates?: string[] | null;
  scopeRepsToTerritory?: boolean;
};

export type RecruitingIntelligenceRouteFailure =
  | { kind: "jobs"; failure: BreezyApiFailure }
  | { kind: "candidates"; failure: BreezyApiFailure };

export async function loadRecruitingIntelligenceRouteBundle(
  session: AuthSession,
  options: LoadRecruitingIntelligenceRouteBundleOptions = {},
): Promise<
  | { ok: true; bundle: RecruitingIntelligenceRouteBundle }
  | { ok: false; failure: RecruitingIntelligenceRouteFailure }
> {
  const { snapshot, meta: intelligenceCache } = await getCachedRecruitingIntelligenceSnapshot({
    forceRefresh: options.forceRefresh,
  });

  if (!snapshot.jobsResult.ok) {
    return { ok: false, failure: { kind: "jobs", failure: snapshot.jobsResult } };
  }
  if (!snapshot.candidatesResult.ok) {
    return { ok: false, failure: { kind: "candidates", failure: snapshot.candidatesResult } };
  }

  const useUnscoped = Boolean(options.unscopedForAdmin && isAdminRole(session.role));
  const territoryStates =
    options.territoryStates !== undefined
      ? (options.territoryStates ?? undefined)
      : (filterStatesForSession(session) ?? undefined);

  const jobs = useUnscoped
    ? snapshot.jobsResult.jobs
    : applyTerritoryToJobs(session, snapshot.jobsResult.jobs);
  const candidates = useUnscoped
    ? snapshot.candidatesResult.candidates
    : applyTerritoryToCandidates(session, snapshot.candidatesResult.candidates);
  const fetchedAt = snapshot.candidatesResult.fetchedAt;
  const opportunities = snapshot.opportunities;

  const activeReps =
    options.scopeRepsToTerritory !== false &&
    territoryStates &&
    territoryStates.length > 0
      ? snapshot.activeReps.filter((rep) =>
          territoryStates.includes(normalizeStateCode(rep.state)),
        )
      : snapshot.activeReps;

  const coverage = buildCoverageRiskSnapshot({
    opportunities,
    reps: activeReps,
    candidates,
    fetchedAt,
    territoryStates,
  });

  return {
    ok: true,
    bundle: {
      jobs,
      jobsResult: {
        ...snapshot.jobsResult,
        jobs,
      },
      candidates,
      workflows: snapshot.workflows,
      opportunities,
      activeReps,
      coverage,
      fetchedAt,
      candidatesResult: snapshot.candidatesResult,
      melOk: snapshot.melOk,
      intelligenceCache,
    },
  };
}
