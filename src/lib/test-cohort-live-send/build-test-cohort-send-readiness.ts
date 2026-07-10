import { buildTestCohortValidationFromStores } from "@/lib/test-cohort-validation";
import { P103_TEST_APPLICANTS } from "@/lib/test-cohort-validation/test-applicants";
import { classifyApplicantSendReadiness } from "@/lib/test-cohort-live-send/classify-applicant-send-readiness";
import type {
  ApplicantSendReadiness,
  TestCohortSendReadinessMetrics,
  TestCohortSendReadinessReport,
} from "@/lib/test-cohort-live-send/types";
import { P104_SOURCE_PHASE } from "@/lib/test-cohort-live-send/types";

function buildMetrics(applicants: ApplicantSendReadiness[]): TestCohortSendReadinessMetrics {
  return {
    applicantCount: applicants.length,
    safeToSendNowCount: applicants.filter((a) => a.safeToSendNow).length,
    alreadySentCount: applicants.filter((a) => a.category === "already_sent").length,
    invalidEmailCount: applicants.filter((a) => a.invalidEmail).length,
    duplicateRiskCount: applicants.filter((a) => a.duplicateRisk).length,
    blockedCount: applicants.filter((a) => a.category === "blocked").length,
    p84EligibleNowCount: applicants.filter((a) => a.p84EligibleNow).length,
  };
}

export async function buildTestCohortSendReadinessFromStores(input?: {
  mtdOnly?: boolean;
}): Promise<TestCohortSendReadinessReport> {
  const { readIngestionStore } = await import("@/lib/candidate-ingestion/ingestion-store");
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );
  const { loadP97State } = await import("@/lib/approval-mode-production/approval-mode-store");
  const { loadP100State } = await import("@/lib/controlled-live-send/controlled-live-send-store");

  const p103 = await buildTestCohortValidationFromStores({ mtdOnly: input?.mtdOnly ?? false });
  const [store, bundle, jobsResult, onboardingRecords, p97State, p100State] = await Promise.all([
    readIngestionStore(),
    getCandidateWorkflowBundle(),
    fetchBreezyJobs("published"),
    listAllCandidateOnboardingRecords(),
    loadP97State(),
    loadP100State(),
  ]);

  const jobsByPositionId = new Map(
    (jobsResult.ok ? jobsResult.jobs : []).map((job) => [job.jobId, job]),
  );
  const onboardingByCandidateId = new Map(onboardingRecords.map((r) => [r.candidateId, r]));
  const p97PersistedIds = new Set(p97State.persisted.map((p) => p.candidateId));
  const p100SentIds = new Set(p100State.sentCandidateIds);

  const applicants = P103_TEST_APPLICANTS.map((applicant) => {
    const validation = p103.applicants.find((a) => a.applicantKey === applicant.key)!;
    const candidateId = validation.candidateId;
    const row =
      candidateId != null
        ? buildScoredWorkflowRow(
            store.candidates[candidateId]!,
            bundle.workflows[candidateId],
            { job: jobsByPositionId.get(store.candidates[candidateId]?.positionId ?? "") },
          )
        : null;

    return classifyApplicantSendReadiness({
      applicant,
      validation,
      row,
      storePositionTitle: candidateId ? store.candidates[candidateId]?.positionName ?? null : null,
      onboarding: candidateId ? onboardingByCandidateId.get(candidateId) ?? null : null,
      jobsByPositionId,
      p97PersistedIds,
      p100SentIds,
    });
  });

  const safeToSend = applicants.filter((a) => a.safeToSendNow);
  const blocked = applicants.filter((a) => a.category === "blocked");
  const invalidEmail = applicants.filter((a) => a.invalidEmail);
  const duplicateRisk = applicants.filter((a) => a.duplicateRisk);
  const alreadySent = applicants.filter((a) => a.category === "already_sent");
  const needingAction = applicants.filter((a) => !a.safeToSendNow && a.category !== "already_sent");

  return {
    sourcePhase: P104_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    sectionTitle: "Test Cohort Urgent Send Readiness",
    p103ValidationGeneratedAt: p103.generatedAt,
    metrics: buildMetrics(applicants),
    safeToSend,
    blocked,
    invalidEmail,
    duplicateRisk,
    alreadySent,
    applicants,
    executions: [],
    needingAction,
  };
}
