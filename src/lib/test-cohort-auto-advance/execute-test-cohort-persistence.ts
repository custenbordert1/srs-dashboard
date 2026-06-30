import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { normalizeStateCode } from "@/lib/dm-territory-map";
import type { BreezyCandidate } from "@/lib/breezy-api";
import { buildPaperworkSendEligibility } from "@/lib/autonomous-paperwork-send-engine/build-paperwork-send-eligibility";
import { persistApprovedCandidate } from "@/lib/approval-mode-production/persist-approved-candidate";
import { loadP97State } from "@/lib/approval-mode-production/approval-mode-store";
import { buildScoredWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  buildTestCohortApprovalEntry,
  buildTestCohortSendEntry,
  isP105PersistenceCandidate,
} from "@/lib/test-cohort-auto-advance/build-test-cohort-persistence";
import type { ApplicantPersistenceResult } from "@/lib/test-cohort-auto-advance/types";
import { P105_ALREADY_SENT_CANDIDATE_IDS } from "@/lib/test-cohort-auto-advance/types";
import { P103_TEST_APPLICANTS } from "@/lib/test-cohort-validation/test-applicants";

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

export async function executeTestCohortPersistence(input: {
  approvedBy: string;
  approvedByUserId: string;
  mtdOnly?: boolean;
}): Promise<ApplicantPersistenceResult[]> {
  const { readIngestionStore, listIngestedCandidates, filterMtdCandidates, currentMtdDateRange } =
    await import("@/lib/candidate-ingestion");
  const { getCandidateWorkflowBundle } = await import("@/lib/candidate-workflow-store");
  const { fetchBreezyJobs } = await import("@/lib/breezy-api");
  const { listAllCandidateOnboardingRecords } = await import(
    "@/lib/candidate-onboarding-engine/onboarding-record-store"
  );
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
  const alreadyPersisted = new Set(p97State.persisted.map((p) => p.candidateId));
  const sentIds = new Set([
    ...p100State.sentCandidateIds,
    ...P105_ALREADY_SENT_CANDIDATE_IDS,
  ]);

  const range = currentMtdDateRange();
  const candidates =
    input.mtdOnly === false
      ? listIngestedCandidates(store)
      : filterMtdCandidates(listIngestedCandidates(store), range);
  const ownership = buildOwnershipIndex(bundle.workflows, candidates);

  const results: ApplicantPersistenceResult[] = [];

  for (const applicant of P103_TEST_APPLICANTS) {
    const candidate = Object.values(store.candidates).find(
      (c) => c.email?.trim().toLowerCase() === applicant.email.trim().toLowerCase(),
    );
    const candidateId = candidate?.candidateId ?? null;

    if (!candidateId || !candidate) {
      results.push({
        applicantKey: applicant.key,
        applicantName: applicant.name,
        candidateId: candidateId ?? "unknown",
        persisted: false,
        skippedReason: "Candidate not found in ingestion store.",
        p84EligibleAfterPersist: false,
        recruiter: null,
        dm: null,
        rollbackId: null,
      });
      continue;
    }

    const gate = isP105PersistenceCandidate({ applicant, candidateId });
    if (!gate.allowed) {
      results.push({
        applicantKey: applicant.key,
        applicantName: applicant.name,
        candidateId,
        persisted: false,
        skippedReason: gate.reason,
        p84EligibleAfterPersist: false,
        recruiter: null,
        dm: null,
        rollbackId: null,
      });
      continue;
    }

    if (sentIds.has(candidateId)) {
      results.push({
        applicantKey: applicant.key,
        applicantName: applicant.name,
        candidateId,
        persisted: false,
        skippedReason: "Already sent.",
        p84EligibleAfterPersist: false,
        recruiter: null,
        dm: null,
        rollbackId: null,
      });
      continue;
    }

    const row = buildScoredWorkflowRow(candidate, bundle.workflows[candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    });
    const approval = buildTestCohortApprovalEntry({
      applicant,
      candidate,
      row,
      workflow: bundle.workflows[candidateId],
      job: jobsByPositionId.get(candidate.positionId),
      rosters: bundle.rosters,
      ownership,
    });
    const sendEntry = buildTestCohortSendEntry({
      approval,
      row,
      jobsByPositionId,
      onboarding: onboardingByCandidateId.get(candidateId) ?? null,
    });

    if (!sendEntry.inSendQueue || sendEntry.eligibilityResult !== "eligible") {
      results.push({
        applicantKey: applicant.key,
        applicantName: applicant.name,
        candidateId,
        persisted: false,
        skippedReason: sendEntry.sendBlockedReason ?? "P84 preview not eligible before persist.",
        p84EligibleAfterPersist: false,
        recruiter: approval.assignedRecruiter,
        dm: approval.suggestedDm,
        rollbackId: null,
      });
      continue;
    }

    if (alreadyPersisted.has(candidateId)) {
      const refreshed = buildScoredWorkflowRow(
        candidate,
        (await getCandidateWorkflowBundle()).workflows[candidateId],
        { job: jobsByPositionId.get(candidate.positionId) },
      );
      const p84 = buildPaperworkSendEligibility({
        row: refreshed,
        onboarding: onboardingByCandidateId.get(candidateId) ?? null,
        jobsByPositionId,
      });
      results.push({
        applicantKey: applicant.key,
        applicantName: applicant.name,
        candidateId,
        persisted: false,
        skippedReason: "Already in P97 state.",
        p84EligibleAfterPersist: p84.eligible,
        recruiter: refreshed.assignedRecruiter,
        dm: refreshed.assignedDM,
        rollbackId: null,
      });
      continue;
    }

    const persisted = await persistApprovedCandidate({
      sendEntry,
      existingWorkflow: bundle.workflows[candidateId],
      approvedBy: input.approvedBy,
      approvedByUserId: input.approvedByUserId,
    });

    const afterBundle = await getCandidateWorkflowBundle();
    const afterRow = buildScoredWorkflowRow(candidate, afterBundle.workflows[candidateId], {
      job: jobsByPositionId.get(candidate.positionId),
    });
    const p84After = buildPaperworkSendEligibility({
      row: afterRow,
      onboarding: onboardingByCandidateId.get(candidateId) ?? null,
      jobsByPositionId,
    });

    results.push({
      applicantKey: applicant.key,
      applicantName: applicant.name,
      candidateId,
      persisted: true,
      skippedReason: null,
      p84EligibleAfterPersist: p84After.eligible,
      recruiter: afterRow.assignedRecruiter,
      dm: afterRow.assignedDM,
      rollbackId: persisted.rollbackId,
    });
  }

  return results;
}
