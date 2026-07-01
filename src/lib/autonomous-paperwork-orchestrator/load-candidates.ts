import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { ApprovedMappingResolution } from "@/lib/p110-approved-mapping-integration/types";
import type { P109ReviewDecisionRecord } from "@/lib/p109-project-mapping-review/types";

export type LoadedPaperworkCandidates = {
  rowsByCandidateId: Map<string, ScoredCandidateWorkflowRow>;
  jobsByPositionId: Map<string, BreezyJob>;
  closedJobsByPositionId: Map<string, BreezyJob>;
  publishedJobs: BreezyJob[];
  publishedJobTitleById: Map<string, string>;
  onboardingByCandidateId: Map<string, CandidateOnboardingRecord>;
  p109ByCandidate: Map<string, P109ReviewDecisionRecord>;
  approvedMappingsByCandidate: Map<string, ApprovedMappingResolution>;
  p100SentIds: Set<string>;
  pilotSentIds: Set<string>;
  candidateIds: string[];
};

export async function loadPaperworkCandidates(input?: {
  candidateIds?: string[];
  mtdOnly?: boolean;
}): Promise<LoadedPaperworkCandidates> {
  const { readIngestionStore, listIngestedCandidates, filterMtdCandidates, currentMtdDateRange } =
    await import("@/lib/candidate-ingestion");
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );
  const { loadP109ReviewRecords } = await import("@/lib/p109-project-mapping-review/review-decision-store");
  const { resolveApprovedMapping } = await import("@/lib/p110-approved-mapping-integration/resolve-approved-mapping");
  const { loadP100State } = await import("@/lib/controlled-live-send/controlled-live-send-store");
  const { loadPilotSendRegistry } = await import("@/lib/p122-controlled-live-paperwork-pilot/pilot-store");
  const { loadPilotConfig } = await import("@/lib/p122-controlled-live-paperwork-pilot/pilot-config");

  const [store, bundle, jobsResult, closedJobsResult, onboardingRecords, p109Records, p100State, pilotRegistry] =
    await Promise.all([
      readIngestionStore(),
      getCandidateWorkflowBundle(),
      fetchBreezyJobs("published"),
      fetchBreezyJobs("closed"),
      listAllCandidateOnboardingRecords(),
      loadP109ReviewRecords(),
      loadP100State(),
      loadPilotSendRegistry(),
    ]);

  const publishedJobs = jobsResult.ok ? jobsResult.jobs : [];
  const jobsByPositionId = new Map(publishedJobs.map((job) => [job.jobId, job]));
  const closedJobsByPositionId = new Map(
    (closedJobsResult.ok ? closedJobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  const publishedJobTitleById = new Map(publishedJobs.map((job) => [job.jobId, job.name]));
  const onboardingByCandidateId = new Map(onboardingRecords.map((record) => [record.candidateId, record]));
  const p109ByCandidate = new Map(p109Records.map((record) => [record.candidateId, record]));

  const range = currentMtdDateRange();
  const allCandidates =
    input?.mtdOnly === false
      ? listIngestedCandidates(store)
      : filterMtdCandidates(listIngestedCandidates(store), range);

  const pilotConfig = loadPilotConfig();
  const scopedIds =
    input?.candidateIds ??
    (pilotConfig.allowlist.length > 0
      ? pilotConfig.allowlist
      : allCandidates.map((candidate) => candidate.candidateId));

  const rowsByCandidateId = new Map(
    scopedIds
      .map((candidateId) => {
        const candidate = store.candidates[candidateId];
        if (!candidate) return null;
        return [
          candidateId,
          buildScoredWorkflowRow(candidate, bundle.workflows[candidateId], {
            job: jobsByPositionId.get(candidate.positionId),
          }),
        ] as const;
      })
      .filter((entry): entry is readonly [string, ScoredCandidateWorkflowRow] => entry !== null),
  );

  const approvedMappingsByCandidate = new Map<string, ApprovedMappingResolution>();
  for (const candidateId of scopedIds) {
    const row = rowsByCandidateId.get(candidateId);
    const approved = resolveApprovedMapping({
      record: p109ByCandidate.get(candidateId) ?? null,
      candidateId,
      closedPositionId: row?.positionId ?? null,
      publishedJobTitleById,
    });
    if (approved) approvedMappingsByCandidate.set(candidateId, approved);
  }

  return {
    rowsByCandidateId,
    jobsByPositionId,
    closedJobsByPositionId,
    publishedJobs,
    publishedJobTitleById,
    onboardingByCandidateId,
    p109ByCandidate,
    approvedMappingsByCandidate,
    p100SentIds: new Set(p100State.sentCandidateIds),
    pilotSentIds: new Set(pilotRegistry.sends.map((entry) => entry.candidateId)),
    candidateIds: scopedIds,
  };
}
