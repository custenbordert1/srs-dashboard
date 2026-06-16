import { listActiveRosterReps } from "@/lib/active-rep-store";
import {
  fetchBreezyCandidates,
  fetchBreezyJobs,
  peekBreezyCandidatesCache,
  peekBreezyJobsCache,
  type BreezyCandidatesResult,
  type BreezyJobsResult,
} from "@/lib/breezy-api";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { buildCoverageRiskSnapshot } from "@/lib/coverage-risk-engine";
import { parseMelOpportunities } from "@/lib/mel-matching/mel-opportunity-parser";
import { fetchMelProjectsSheet } from "@/lib/mel-projects-sheet";
import { buildRecruitingIntelligenceMetrics } from "@/lib/recruiting-intelligence/build-recruiting-intelligence-metrics";
import type { RecruitingIntelligenceSnapshot } from "@/lib/recruiting-intelligence/recruiting-intelligence-types";

function emptyJobsSnapshot(fetchedAt: string): Extract<BreezyJobsResult, { ok: true }> {
  return {
    ok: true,
    jobs: [],
    fetchedAt,
    state: "published",
    companyId: "cache",
  };
}

function emptyCandidatesSnapshot(fetchedAt: string): Extract<BreezyCandidatesResult, { ok: true }> {
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

function assembleRecruitingIntelligenceSnapshot(input: {
  builtAt: string;
  jobsResult: BreezyJobsResult;
  candidatesResult: BreezyCandidatesResult;
  workflows: Awaited<ReturnType<typeof getCandidateWorkflowState>>;
  melResult: Awaited<ReturnType<typeof fetchMelProjectsSheet>>;
  activeReps: Awaited<ReturnType<typeof listActiveRosterReps>>;
}): RecruitingIntelligenceSnapshot {
  const { builtAt, jobsResult, candidatesResult, workflows, melResult, activeReps } = input;
  const fetchedAt = candidatesResult.ok
    ? candidatesResult.fetchedAt
    : jobsResult.ok
      ? jobsResult.fetchedAt
      : builtAt;

  const melOk = melResult.ok;
  const opportunities = melOk ? parseMelOpportunities(melResult.rows) : [];

  const globalCoverage =
    jobsResult.ok && candidatesResult.ok
      ? buildCoverageRiskSnapshot({
          opportunities,
          reps: activeReps,
          candidates: candidatesResult.candidates,
          fetchedAt,
          territoryStates: undefined,
        })
      : null;

  const metrics = buildRecruitingIntelligenceMetrics({
    jobsResult,
    candidatesResult,
    workflows,
    opportunities,
    activeReps,
    melOk,
    globalCoverage,
  });

  return {
    fetchedAt,
    builtAt,
    jobsResult,
    candidatesResult,
    workflows,
    melResult,
    opportunities,
    activeReps,
    melOk,
    globalCoverage,
    metrics,
  };
}

/** Fast path for executive routes — uses in-memory Breezy caches without live extraction. */
export async function buildRecruitingIntelligenceSnapshotFromWarmCaches(
  prior?: RecruitingIntelligenceSnapshot | null,
): Promise<RecruitingIntelligenceSnapshot> {
  const builtAt = new Date().toISOString();
  const jobsResult =
    peekBreezyJobsCache("published") ??
    (prior?.jobsResult.ok ? prior.jobsResult : emptyJobsSnapshot(builtAt));
  const candidatesResult =
    peekBreezyCandidatesCache() ??
    (prior?.candidatesResult.ok ? prior.candidatesResult : emptyCandidatesSnapshot(builtAt));

  const [workflows, activeReps] = await Promise.all([
    getCandidateWorkflowState(),
    listActiveRosterReps(),
  ]);

  const melResult = prior?.melResult ?? {
    ok: false as const,
    error: "MEL sheet deferred until background refresh",
    fetchedAt: builtAt,
    csvUrl: "",
  };

  return assembleRecruitingIntelligenceSnapshot({
    builtAt,
    jobsResult,
    candidatesResult,
    workflows,
    melResult,
    activeReps,
  });
}

export async function buildRecruitingIntelligenceSnapshot(): Promise<RecruitingIntelligenceSnapshot> {
  const builtAt = new Date().toISOString();

  const [jobsResult, candidatesResult, workflows, melResult, activeReps] = await Promise.all([
    fetchBreezyJobs("published"),
    fetchBreezyCandidates({ scanMode: "fast" }),
    getCandidateWorkflowState(),
    fetchMelProjectsSheet(),
    listActiveRosterReps(),
  ]);

  return assembleRecruitingIntelligenceSnapshot({
    builtAt,
    jobsResult,
    candidatesResult,
    workflows,
    melResult,
    activeReps,
  });
}
