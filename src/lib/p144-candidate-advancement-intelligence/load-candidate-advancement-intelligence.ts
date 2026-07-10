import { applyTerritoryToCandidates, applyTerritoryToJobs } from "@/lib/auth/territory-filter";
import type { AuthSession } from "@/lib/auth/types";
import type { BreezyJob } from "@/lib/breezy-api";
import { fetchBreezyJobs } from "@/lib/breezy-api";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import { resolveCandidatesForRead } from "@/lib/candidate-ingestion";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { loadCandidateOnboardingPolicy } from "@/lib/candidate-onboarding-engine/onboarding-policy-store";
import { DEFAULT_PAPERWORK_BY_GRADE } from "@/lib/candidate-onboarding-engine/paperwork-grade-policy";
import { buildCandidateAdvancementIntelligenceSnapshot } from "@/lib/p144-candidate-advancement-intelligence/build-advancement-intelligence-snapshot";
import type { CandidateAdvancementIntelligenceSnapshot } from "@/lib/p144-candidate-advancement-intelligence/types";
import { buildRecruitingLiveSnapshot } from "@/lib/recruiting-live-snapshot";
import { evaluateCandidate } from "@/lib/recruiting/candidate-advancement-engine";

export type CandidateAdvancementIntelligenceLoadResult =
  | {
      ok: true;
      snapshot: CandidateAdvancementIntelligenceSnapshot;
      partialSync: boolean;
      meta: {
        candidatesFromIngestionStore: boolean;
        candidateSource: string | null;
        jobsCount: number;
        refreshedAt: string;
      };
    }
  | {
      ok: false;
      error: string;
      partial?: boolean;
      snapshot?: CandidateAdvancementIntelligenceSnapshot;
    };

function jobsMap(jobs: BreezyJob[]): Map<string, BreezyJob> {
  return new Map(jobs.map((job) => [job.jobId, job]));
}

export async function loadCandidateAdvancementIntelligenceForSession(
  session: AuthSession,
): Promise<CandidateAdvancementIntelligenceLoadResult> {
  const generatedAt = new Date().toISOString();

  const [workflows, candidatesResult, jobsResult, onboardingPolicy, liveSnapshot] = await Promise.all([
    getCandidateWorkflowState(),
    resolveCandidatesForRead({ scanMode: "preview" }),
    fetchBreezyJobs("published").catch(() => ({ ok: false as const, error: "Jobs unavailable", fetchedAt: generatedAt })),
    loadCandidateOnboardingPolicy().catch(() => null),
    buildRecruitingLiveSnapshot().catch(() => null),
  ]);

  const partialSync =
    !candidatesResult.ok ||
    Boolean(candidatesResult.ok && candidatesResult.truncated) ||
    !jobsResult.ok;

  const candidates = candidatesResult.ok
    ? applyTerritoryToCandidates(session, candidatesResult.candidates)
    : [];
  const jobs = jobsResult.ok ? applyTerritoryToJobs(session, jobsResult.jobs) : [];
  const jobsByPositionId = jobsMap(jobs);
  const paperworkByGrade = onboardingPolicy?.paperworkByGrade ?? DEFAULT_PAPERWORK_BY_GRADE;

  const liveMeta =
    liveSnapshot?.ok === true
      ? {
          candidateSource: liveSnapshot.candidateSource,
          candidateCount: liveSnapshot.candidateCount,
          ingestionCandidateCount: liveSnapshot.ingestionCandidateCount,
          previewCandidateCount: liveSnapshot.previewCandidateCount,
          fallbackReason: liveSnapshot.fallbackReason,
          candidatesFreshnessTimestamp: liveSnapshot.candidatesFreshnessTimestamp,
        }
      : null;

  const evaluations = candidates.map((candidate) => {
    const row = buildScoredWorkflowRow(candidate, workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId ?? ""),
    });
    return evaluateCandidate({
      row,
      jobsByPositionId,
      advancementOptions: { jobsByPositionId, paperworkByGrade, requireApproval: true },
      coveragePressure: row.isTopMatch ? 80 : 55,
      projectPriority: row.matchPercent,
      liveSnapshotMeta: liveMeta,
    });
  });

  const snapshot = buildCandidateAdvancementIntelligenceSnapshot({
    evaluations,
    generatedAt,
    partialSync,
  });

  if (!candidatesResult.ok && evaluations.length === 0) {
    return {
      ok: false,
      error: candidatesResult.error,
      partial: true,
      snapshot,
    };
  }

  return {
    ok: true,
    snapshot,
    partialSync,
    meta: {
      candidatesFromIngestionStore: candidatesResult.ok ? candidatesResult.fromIngestionStore : false,
      candidateSource: liveSnapshot?.ok ? liveSnapshot.candidateSource : null,
      jobsCount: jobs.length,
      refreshedAt: generatedAt,
    },
  };
}
