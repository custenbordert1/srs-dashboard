import type { BreezyCandidate } from "@/lib/breezy-api";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import { buildApplicantValidationResult } from "@/lib/test-cohort-validation/build-applicant-validation";
import { resolveBestApplicantMatch } from "@/lib/test-cohort-validation/match-test-applicant";
import { P103_TEST_APPLICANTS } from "@/lib/test-cohort-validation/test-applicants";
import {
  P103_PREVIEW_MODE,
  P103_SOURCE_PHASE,
  type TestCohortValidationMetrics,
  type TestCohortValidationReport,
} from "@/lib/test-cohort-validation/types";

function buildOwnershipIndex(
  workflows: Record<string, import("@/lib/candidate-workflow-types").CandidateWorkflowRecord>,
  candidates: BreezyCandidate[],
): Map<string, { total: number; byState: Map<string, number> }> {
  const candidateState = new Map(candidates.map((c) => [c.candidateId, normalizeStateCode(c.state)]));
  const index = new Map<string, { total: number; byState: Map<string, number> }>();

  for (const record of Object.values(workflows)) {
    const recruiter = record.assignedRecruiter.trim();
    if (isUnassignedRecruiter(recruiter)) continue;
    const bucket = index.get(recruiter) ?? { total: 0, byState: new Map() };
    bucket.total += 1;
    const state = candidateState.get(record.candidateId);
    if (state) bucket.byState.set(state, (bucket.byState.get(state) ?? 0) + 1);
    index.set(recruiter, bucket);
  }

  return index;
}

function buildClusterIndex(): Record<string, string[]> {
  const clusters: Record<string, string[]> = {};
  for (const applicant of P103_TEST_APPLICANTS) {
    if (!applicant.cluster) continue;
    const list = clusters[applicant.cluster] ?? [];
    list.push(applicant.name);
    clusters[applicant.cluster] = list;
  }
  return clusters;
}

function buildMetrics(applicants: TestCohortValidationReport["applicants"]): TestCohortValidationMetrics {
  return {
    applicantCount: applicants.length,
    matchedCount: applicants.filter((a) => a.matchStatus === "matched").length,
    unmatchedCount: applicants.filter((a) => a.matchStatus === "unmatched").length,
    ambiguousCount: applicants.filter((a) => a.matchStatus === "ambiguous").length,
    duplicateCount: applicants.filter((a) => a.duplicateStatus !== "none").length,
    invalidEmailCount: applicants.filter((a) => !a.contact.emailValid).length,
    invalidPhoneCount: applicants.filter((a) => !a.contact.phoneValid).length,
    p84EligibleCount: applicants.filter((a) => a.p84?.eligible).length,
    sendQueueDryRunCount: applicants.filter((a) => a.p100DryRun?.inSendQueue).length,
    blockedCount: applicants.filter(
      (a) =>
        a.matchStatus !== "matched" ||
        !a.paperworkSendEligible ||
        a.p100DryRun?.status === "blocked",
    ).length,
  };
}

export function buildTestCohortValidation(input: {
  candidates: BreezyCandidate[];
  rowsByCandidateId: Map<string, import("@/lib/build-candidate-workflow-row").ScoredCandidateWorkflowRow>;
  jobsByPositionId: Map<string, import("@/lib/breezy-api").BreezyJob>;
  workflows: Record<string, import("@/lib/candidate-workflow-types").CandidateWorkflowRecord>;
  rosters: import("@/lib/candidate-workflow-types").RecruiterRosters;
  onboardingByCandidateId: Map<string, import("@/lib/candidate-onboarding-engine/types").CandidateOnboardingRecord>;
  paperworkByGrade: import("@/lib/candidate-onboarding-engine/types").PaperworkByGrade;
  p100SentIds?: string[];
  generatedAt?: string;
}): TestCohortValidationReport {
  const ownership = buildOwnershipIndex(input.workflows, input.candidates);
  const p100SentIds = new Set(input.p100SentIds ?? []);

  const applicants = P103_TEST_APPLICANTS.map((applicant) => {
    const { best, ambiguous } = resolveBestApplicantMatch(applicant, input.candidates);
    const row = best ? input.rowsByCandidateId.get(best.candidate.candidateId) ?? null : null;

    return buildApplicantValidationResult({
      applicant,
      match: best,
      ambiguous,
      row,
      candidate: best?.candidate ?? null,
      jobsByPositionId: input.jobsByPositionId,
      workflows: input.workflows,
      rosters: input.rosters,
      ownership,
      onboarding: best ? input.onboardingByCandidateId.get(best.candidate.candidateId) ?? null : null,
      paperworkByGrade: input.paperworkByGrade,
      p100SentIds,
    });
  });

  return {
    sourcePhase: P103_SOURCE_PHASE,
    previewMode: P103_PREVIEW_MODE,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sectionTitle: "Applicant Test Cohort Validation",
    cohortLabel: "P103 — 11-applicant preview cohort (no sends, no Breezy writes)",
    metrics: buildMetrics(applicants),
    clusters: buildClusterIndex(),
    applicants,
    safetyConfirmation: {
      noSends: true,
      noBreezyWrites: true,
      noDropboxCalls: true,
      liveSendForcedFalse: true,
    },
  };
}

export async function buildTestCohortValidationFromStores(input?: {
  mtdOnly?: boolean;
}): Promise<TestCohortValidationReport> {
  const { readIngestionStore, listIngestedCandidates, filterMtdCandidates, currentMtdDateRange } =
    await import("@/lib/candidate-ingestion");
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );
  const { loadCandidateOnboardingPolicy } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-policy-store"
  );
  const { loadP100State } = await import("@/lib/controlled-live-send/controlled-live-send-store");

  const [store, bundle, jobsResult, onboardingRecords, policy, p100State] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
    listAllCandidateOnboardingRecords(),
    loadCandidateOnboardingPolicy(),
    loadP100State(),
  ]);

  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );

  const range = currentMtdDateRange();
  const candidates =
    input?.mtdOnly === false
      ? listIngestedCandidates(store)
      : filterMtdCandidates(listIngestedCandidates(store), range);

  const rows = candidates.map((candidate) =>
    buildScoredWorkflowRow(candidate, bundle.workflows[candidate.candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    }),
  );

  return buildTestCohortValidation({
    candidates,
    rowsByCandidateId: new Map(rows.map((row) => [row.candidateId, row])),
    jobsByPositionId,
    workflows: bundle.workflows,
    rosters: bundle.rosters,
    onboardingByCandidateId: new Map(onboardingRecords.map((r) => [r.candidateId, r])),
    paperworkByGrade: policy.paperworkByGrade,
    p100SentIds: p100State.sentCandidateIds,
  });
}
