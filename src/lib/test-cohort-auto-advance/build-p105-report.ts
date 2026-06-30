import { p97AuditLogPath, p97RollbackPath } from "@/lib/approval-mode-production/approval-mode-store";
import { diagnoseApplicantBlockers } from "@/lib/test-cohort-auto-advance/diagnose-applicant-blockers";
import { executeTestCohortPersistence } from "@/lib/test-cohort-auto-advance/execute-test-cohort-persistence";
import type { P105Metrics, P105Report } from "@/lib/test-cohort-auto-advance/types";
import { P105_ALREADY_SENT_CANDIDATE_IDS, P105_SOURCE_PHASE } from "@/lib/test-cohort-auto-advance/types";
import { buildTestCohortSendReadinessFromStores } from "@/lib/test-cohort-live-send";
import { executeTestCohortSafeSends } from "@/lib/test-cohort-live-send/execute-test-cohort-sends";
import { P103_TEST_APPLICANTS } from "@/lib/test-cohort-validation/test-applicants";
import { resolveBestApplicantMatch } from "@/lib/test-cohort-validation/match-test-applicant";

function buildMetrics(report: Pick<P105Report, "safeToSend" | "blocked" | "invalidEmail" | "duplicateRisk" | "alreadySent" | "persisted" | "executions">): P105Metrics {
  return {
    applicantCount: P103_TEST_APPLICANTS.length,
    persistedCount: report.persisted.filter((p) => p.persisted).length,
    safeToSendCount: report.safeToSend.length,
    sentCount: report.executions.filter((e) => e.mode === "executeOne" && e.outcome === "sent").length,
    blockedCount: report.blocked.length,
    invalidEmailCount: report.invalidEmail.length,
    duplicateRiskCount: report.duplicateRisk.length,
    alreadySentCount: report.alreadySent.length,
  };
}

export async function buildP105Report(input?: {
  mtdOnly?: boolean;
  executeSends?: boolean;
  approvedBy?: string;
  approvedByUserId?: string;
}): Promise<P105Report> {
  const mtdOnly = input?.mtdOnly ?? false;
  const preReadiness = await buildTestCohortSendReadinessFromStores({ mtdOnly });

  const { readIngestionStore, listIngestedCandidates } = await import("@/lib/candidate-ingestion");
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { buildScoredWorkflowRow } = await import("@/lib/build-candidate-workflow-row");
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );
  const { loadP97State } = await import("@/lib/approval-mode-production/approval-mode-store");
  const { loadP100State } = await import("@/lib/controlled-live-send/controlled-live-send-store");

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
  const p97Ids = new Set(p97State.persisted.map((p) => p.candidateId));
  const sentIds = new Set([...p100State.sentCandidateIds, ...P105_ALREADY_SENT_CANDIDATE_IDS]);

  const candidates = listIngestedCandidates(store);
  const diagnoses = P103_TEST_APPLICANTS.map((applicant) => {
    const { best } = resolveBestApplicantMatch(applicant, candidates);
    const candidateId = best?.candidate.candidateId ?? null;
    const row =
      candidateId != null
        ? buildScoredWorkflowRow(
            store.candidates[candidateId]!,
            bundle.workflows[candidateId],
            { job: jobsByPositionId.get(store.candidates[candidateId]?.positionId ?? "") },
          )
        : null;

    return {
      applicantKey: applicant.key,
      applicantName: applicant.name,
      candidateId,
      diagnosis: diagnoseApplicantBlockers({
        row,
        onboarding: candidateId ? onboardingByCandidateId.get(candidateId) ?? null : null,
        jobsByPositionId,
        inP97Cohort: candidateId ? p97Ids.has(candidateId) : false,
        alreadySent: candidateId ? sentIds.has(candidateId) : false,
        applicantEmail: applicant.email,
      }),
    };
  });

  const persisted = await executeTestCohortPersistence({
    approvedBy: input?.approvedBy ?? "P105 Test Cohort Auto-Advance",
    approvedByUserId: input?.approvedByUserId ?? "p105-auto-advance",
    mtdOnly,
  });

  const postReadiness = await buildTestCohortSendReadinessFromStores({ mtdOnly });
  const safeToSend = postReadiness.applicants.filter((a) => a.safeToSendNow);

  let executions = postReadiness.executions;
  let finalReadiness = postReadiness;

  if (input?.executeSends && safeToSend.length > 0) {
    finalReadiness = await executeTestCohortSafeSends({
      report: { ...postReadiness, safeToSend },
      executiveApprovalFlag: true,
      mtdOnly,
      dryRunOnly: false,
    });
    executions = finalReadiness.executions;
  } else if (safeToSend.length > 0) {
    finalReadiness = await executeTestCohortSafeSends({
      report: { ...postReadiness, safeToSend },
      mtdOnly,
      dryRunOnly: true,
    });
    executions = finalReadiness.executions;
  }

  const report: P105Report = {
    sourcePhase: P105_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    sectionTitle: "P105 Test Cohort Auto-Advance + Controlled Sends",
    p104ClassificationAt: preReadiness.generatedAt,
    metrics: buildMetrics({
      safeToSend: finalReadiness.safeToSend,
      blocked: finalReadiness.blocked,
      invalidEmail: finalReadiness.invalidEmail,
      duplicateRisk: finalReadiness.duplicateRisk,
      alreadySent: finalReadiness.alreadySent,
      persisted,
      executions,
    }),
    diagnoses,
    persisted,
    safeToSend: finalReadiness.safeToSend,
    blocked: finalReadiness.blocked,
    invalidEmail: finalReadiness.invalidEmail,
    duplicateRisk: finalReadiness.duplicateRisk,
    alreadySent: finalReadiness.alreadySent,
    executions,
    needingAction: finalReadiness.needingAction,
    artifactPaths: {
      p97Audit: p97AuditLogPath(),
      p97Rollback: p97RollbackPath(),
      p104Artifact: "artifacts/p104-test-cohort-live-send.json",
      p105Artifact: ".data/p105-test-cohort-auto-advance.json",
    },
  };

  report.metrics = buildMetrics(report);
  return report;
}
