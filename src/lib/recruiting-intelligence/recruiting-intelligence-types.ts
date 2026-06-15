import type { ActiveRep } from "@/lib/rep-intelligence/rep-types";
import type {
  BreezyCandidatesResult,
  BreezyJobsResult,
} from "@/lib/breezy-api";
import type { CandidateWorkflowState } from "@/lib/candidate-workflow-types";
import type { CoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import type { MelOpportunity } from "@/lib/mel-matching/matching-engine-types";
import type { MelProjectsDataResult } from "@/lib/mel-projects-sheet";

export type RecruitingIntelligenceCacheStatus =
  | "fresh"
  | "stale-serving"
  | "refreshing"
  | "miss"
  | "empty";

export type RecruitingIntelligenceMetrics = {
  jobCount: number;
  candidateCount: number;
  workflowCount: number;
  opportunityCount: number;
  activeRepCount: number;
  openCalls: number;
  avgCoveragePercent: number;
  criticalOpportunities: number;
  partialCandidateSync: boolean;
  melAvailable: boolean;
};

export type RecruitingIntelligenceSnapshot = {
  fetchedAt: string;
  builtAt: string;
  jobsResult: BreezyJobsResult;
  candidatesResult: BreezyCandidatesResult;
  workflows: CandidateWorkflowState;
  melResult: MelProjectsDataResult;
  opportunities: MelOpportunity[];
  activeReps: ActiveRep[];
  melOk: boolean;
  globalCoverage: CoverageRiskSnapshot | null;
  metrics: RecruitingIntelligenceMetrics;
};

export type RecruitingIntelligenceCacheDiagnostics = {
  cacheStatus: RecruitingIntelligenceCacheStatus;
  snapshotAgeMs: number | null;
  snapshotAgeLabel: string;
  lastRefreshAt: string | null;
  lastBuiltAt: string | null;
  ttlMs: number;
  isStale: boolean;
  backgroundRefreshInFlight: boolean;
  hitCount: number;
  missCount: number;
  staleServeCount: number;
  recordCounts: RecruitingIntelligenceMetrics | null;
};

export type RecruitingIntelligenceCacheMeta = {
  cacheStatus: RecruitingIntelligenceCacheStatus;
  snapshotAgeMs: number;
  isStale: boolean;
  backgroundRefresh: boolean;
  lastRefreshAt: string;
  recordCounts: Pick<
    RecruitingIntelligenceMetrics,
    "jobCount" | "candidateCount" | "opportunityCount" | "workflowCount"
  >;
};

export type GetCachedRecruitingIntelligenceOptions = {
  forceRefresh?: boolean;
};

export type CachedRecruitingIntelligenceResponse = {
  snapshot: RecruitingIntelligenceSnapshot;
  meta: RecruitingIntelligenceCacheMeta;
};
