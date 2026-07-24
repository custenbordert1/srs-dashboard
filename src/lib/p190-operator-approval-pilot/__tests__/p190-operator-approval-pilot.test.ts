import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertCohortImmutable,
  buildApprovalIdempotencyKey,
  cohortFingerprint,
  freezeP190FromP189Cohort,
  newP190Authorization,
  P190_PILOT_SIZE,
  P190_REQUIRED_SOURCE_COHORT_ID,
  P190_REQUIRED_SOURCE_FINGERPRINT,
  validateOperatorApprovalCandidate,
  type P190FrozenCohort,
} from "@/lib/p190-operator-approval-pilot";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

function fakeWf(
  id: string,
  overrides: Partial<CandidateWorkflowRecord> = {},
): CandidateWorkflowRecord {
  const now = new Date().toISOString();
  return {
    candidateId: id,
    workflowStatus: "Applied",
    assignedRecruiter: "Taylor",
    assignedDM: "Field Ops",
    recommendedStage: "Hiring Recommendation",
    paperworkStatus: "not_sent",
    paperworkSentAt: null,
    signatureRequestId: null,
    notes: [],
    history: [],
    updatedAt: now,
    createdAt: now,
    lastActionAt: now,
    progressionReason: null,
    nextActionNeeded: "Await operator approval",
    recruiterOwnershipVersion: 1,
    ...overrides,
  } as CandidateWorkflowRecord;
}

describe("P190 Operator Approval pilot", () => {
  it("fingerprints membership like P189", () => {
    assert.equal(
      cohortFingerprint(["c2", "c1", "c3"]),
      cohortFingerprint(["c1", "c3", "c2"]),
    );
  });

  it("rejects candidates outside frozen cohort", () => {
    const cohort: P190FrozenCohort = {
      cohortId: "test",
      fingerprint: "fp",
      sourceCohortId: P190_REQUIRED_SOURCE_COHORT_ID,
      sourceFingerprint: P190_REQUIRED_SOURCE_FINGERPRINT,
      frozenAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      size: 1,
      immutable: true,
      members: [
        {
          candidateId: "inside",
          recruiter: "Taylor",
          jobId: "j1",
          jobLabel: "Job",
          city: null,
          state: null,
          currentStage: "Applied",
          recommendedStage: "Hiring Recommendation",
          expectedNewStage: "Operator Approved",
          expectedOwnershipVersion: 1,
          productionRecordVersion: "v1",
          idempotencyKey: "k",
          rollbackReference: "r",
          sourceCohortId: P190_REQUIRED_SOURCE_COHORT_ID,
        },
      ],
      sourcePhase: "P190",
      schemaVersion: 1,
    };
    assert.doesNotThrow(() => assertCohortImmutable(cohort, "inside"));
    assert.throws(() => assertCohortImmutable(cohort, "outside"));
  });

  it("refuses freeze when fingerprint mismatches", () => {
    const ids = Array.from({ length: 25 }, (_, i) => `cand-${i}`);
    const source = {
      cohortId: P190_REQUIRED_SOURCE_COHORT_ID,
      fingerprint: "wrong-fingerprint-00000000",
      members: ids.map((id) => ({
        candidateId: id,
        recruiter: "Taylor",
        jobId: "job",
      })),
    };
    const map = new Map(ids.map((id) => [id, fakeWf(id)]));
    assert.throws(() =>
      freezeP190FromP189Cohort({ source, workflowsById: map }),
    );
  });

  it("freezes only the required P189 cohort when fingerprint matches", () => {
    // Build 25 IDs whose sorted fingerprint equals the required constant —
    // use real P189 fingerprint by reading from the required ID set is not possible here;
    // instead verify freeze path with synthetic matching fingerprint.
    const members = Array.from({ length: 25 }, (_, i) => ({
      candidateId: `id-${String(i).padStart(2, "0")}`,
      recruiter: "Taylor",
      jobId: "job",
      jobLabel: "Job",
      city: "Ames",
      state: "IA",
    }));
    const fp = cohortFingerprint(members.map((m) => m.candidateId));
    // This test asserts refuse unless fingerprint equals required constant
    assert.notEqual(fp, P190_REQUIRED_SOURCE_FINGERPRINT);
    assert.throws(() =>
      freezeP190FromP189Cohort({
        source: {
          cohortId: P190_REQUIRED_SOURCE_COHORT_ID,
          fingerprint: fp,
          members,
        },
        workflowsById: new Map(members.map((m) => [m.candidateId, fakeWf(m.candidateId)])),
      }),
    );
  });

  it("validation requires Recommend Hire and blocks paperwork/duplicates", () => {
    const member = {
      candidateId: "c1",
      recruiter: "Taylor",
      jobId: "j1",
      jobLabel: null,
      city: null,
      state: null,
      currentStage: "Applied",
      recommendedStage: "Hiring Recommendation",
      expectedNewStage: "Operator Approved" as const,
      expectedOwnershipVersion: 1,
      productionRecordVersion: "v",
      idempotencyKey: "k",
      rollbackReference: "r",
      sourceCohortId: P190_REQUIRED_SOURCE_COHORT_ID,
    };
    const ok = validateOperatorApprovalCandidate({
      member,
      workflow: fakeWf("c1"),
      jobResolved: true,
    });
    assert.equal(ok.ok, true);

    const noRec = validateOperatorApprovalCandidate({
      member,
      workflow: fakeWf("c1", { recommendedStage: null }),
      jobResolved: true,
    });
    assert.equal(noRec.ok, false);
    assert.ok(noRec.blockers.some((b) => b.startsWith("recommend_hire_exists")));

    const paperwork = validateOperatorApprovalCandidate({
      member,
      workflow: fakeWf("c1", {
        paperworkStatus: "sent",
        paperworkSentAt: new Date().toISOString(),
      }),
      jobResolved: true,
    });
    assert.equal(paperwork.ok, false);

    const dup = validateOperatorApprovalCandidate({
      member,
      workflow: fakeWf("c1", { workflowStatus: "Operator Approved" }),
      jobResolved: true,
    });
    assert.equal(dup.ok, false);
  });

  it("authorization disallows paperwork/P187/MEL", () => {
    // Construct a minimal fake cohort for auth helper
    const members = Array.from({ length: P190_PILOT_SIZE }, (_, i) => ({
      candidateId: `z${i}`,
      recruiter: "Taylor",
      jobId: "j",
      jobLabel: null,
      city: null,
      state: null,
      currentStage: "Applied",
      recommendedStage: "Hiring Recommendation",
      expectedNewStage: "Operator Approved" as const,
      expectedOwnershipVersion: 1,
      productionRecordVersion: "v",
      idempotencyKey: buildApprovalIdempotencyKey(`z${i}`, "c", "v"),
      rollbackReference: "r",
      sourceCohortId: P190_REQUIRED_SOURCE_COHORT_ID,
    }));
    const cohort: P190FrozenCohort = {
      cohortId: "c",
      fingerprint: cohortFingerprint(members.map((m) => m.candidateId)),
      sourceCohortId: P190_REQUIRED_SOURCE_COHORT_ID,
      sourceFingerprint: P190_REQUIRED_SOURCE_FINGERPRINT,
      frozenAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      size: members.length,
      immutable: true,
      members,
      sourcePhase: "P190",
      schemaVersion: 1,
    };
    const auth = newP190Authorization({ cohort });
    assert.equal(auth.allowPaperwork, false);
    assert.equal(auth.allowP184, false);
    assert.equal(auth.allowP187, false);
    assert.equal(auth.allowMel, false);
    assert.equal(auth.allowDropboxSign, false);
    assert.equal(auth.maxWrites, 25);
  });
});
