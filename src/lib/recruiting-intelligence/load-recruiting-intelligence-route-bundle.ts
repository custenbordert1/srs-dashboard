import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import { filterStatesForSession } from "@/lib/auth/permissions";
import { isAdminRole } from "@/lib/auth/roles";
import type { AuthSession } from "@/lib/auth/types";
import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import type {
  BreezyApiFailure,
  BreezyCandidate,
  BreezyJob,
  BreezyCandidatesResult,
  BreezyJobsResult,
} from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { buildCoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import { getCachedRecruitingIntelligenceSnapshot } from "@/lib/recruiting-intelligence/recruiting-intelligence-cache";
import type {
  RecruitingIntelligenceCacheMeta,
  RecruitingIntelligenceSnapshot,
} from "@/lib/recruiting-intelligence/recruiting-intelligence-types";

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
  preferCache?: boolean;
  allowPartialSources?: boolean;
  unscopedForAdmin?: boolean;
  territoryStates?: string[] | null;
  scopeRepsToTerritory?: boolean;
  intelligenceCache?: RecruitingIntelligenceCacheMeta;
};

export type RecruitingIntelligenceRouteFailure =
  | { kind: "jobs"; failure: BreezyApiFailure }
  | { kind: "candidates"; failure: BreezyApiFailure };

function emptyJobsResult(fetchedAt: string): Extract<BreezyJobsResult, { ok: true }> {
  return { ok: true, jobs: [], fetchedAt, state: "published", companyId: "cache" };
}

function emptyCandidatesResult(fetchedAt: string): Extract<BreezyCandidatesResult, { ok: true }> {
  return {
    ok: true,
    candidates: [],
    fetchedAt,
    companyId: "cache",
    scanMode: "fast",
    positionsScanned: 0,
    totalPositionsAvailable: 0,
    partial: true,
    hydrationComplete: false,
    source: "recruiting-intelligence-cache",
  };
}

export function buildRouteBundleFromSnapshot(
  session: AuthSession,
  snapshot: RecruitingIntelligenceSnapshot,
  options: Omit<LoadRecruitingIntelligenceRouteBundleOptions, "forceRefresh" | "preferCache"> = {},
): RecruitingIntelligenceRouteBundle {
  const useUnscoped = Boolean(options.unscopedForAdmin && isAdminRole(session.role));
  const territoryStates =
    options.territoryStates !== undefined
      ? (options.territoryStates ?? undefined)
      : (filterStatesForSession(session) ?? undefined);

  const jobsResult = snapshot.jobsResult.ok
    ? snapshot.jobsResult
    : emptyJobsResult(snapshot.fetchedAt);
  const candidatesResult = snapshot.candidatesResult.ok
    ? snapshot.candidatesResult
    : emptyCandidatesResult(snapshot.fetchedAt);

  const jobs = useUnscoped ? jobsResult.jobs : applyTerritoryToJobs(session, jobsResult.jobs);
  const candidates = useUnscoped
    ? candidatesResult.candidates
    : applyTerritoryToCandidates(session, candidatesResult.candidates);
  const fetchedAt = candidatesResult.fetchedAt;
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

  const intelligenceCache =
    options.intelligenceCache ??
    ({
      cacheStatus: "warm-serving",
      snapshotAgeMs: 0,
      isStale: true,
      backgroundRefresh: true,
      lastRefreshAt: fetchedAt,
      recordCounts: {
        jobCount: jobs.length,
        candidateCount: candidates.length,
        opportunityCount: opportunities.length,
        workflowCount: Object.keys(snapshot.workflows).length,
      },
    } satisfies RecruitingIntelligenceCacheMeta);

  return {
    jobs,
    jobsResult: { ...jobsResult, jobs },
    candidates,
    workflows: snapshot.workflows,
    opportunities,
    activeReps,
    coverage,
    fetchedAt,
    candidatesResult: { ...candidatesResult, candidates },
    melOk: snapshot.melOk,
    intelligenceCache,
  };
}

export async function loadRecruitingIntelligenceRouteBundle(
  session: AuthSession,
  options: LoadRecruitingIntelligenceRouteBundleOptions = {},
): Promise<
  | { ok: true; bundle: RecruitingIntelligenceRouteBundle }
  | { ok: false; failure: RecruitingIntelligenceRouteFailure }
> {
  const { snapshot, meta: intelligenceCache } = await getCachedRecruitingIntelligenceSnapshot({
    forceRefresh: options.forceRefresh,
    preferCache: options.preferCache,
  });

  if (!snapshot.jobsResult.ok && !options.allowPartialSources) {
    return { ok: false, failure: { kind: "jobs", failure: snapshot.jobsResult } };
  }
  if (!snapshot.candidatesResult.ok && !options.allowPartialSources) {
    return { ok: false, failure: { kind: "candidates", failure: snapshot.candidatesResult } };
  }

  return {
    ok: true,
    bundle: buildRouteBundleFromSnapshot(session, snapshot, {
      ...options,
      intelligenceCache,
    }),
  };
}
