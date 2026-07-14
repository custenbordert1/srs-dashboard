import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertCohortImmutable,
  buildPaperworkIdempotencyKey,
  cohortFingerprint,
  newP191Authorization,
  P191_PILOT_SIZE,
  P191_REQUIRED_SOURCE_COHORT_ID,
  P191_REQUIRED_SOURCE_FINGERPRINT,
  validatePaperworkReleaseCandidate,
  type P191FrozenCohort,
} from "@/lib/p191-paperwork-release-pilot";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";

function fakeWf(
  id: string,
  overrides: Partial<CandidateWorkflowRecord> = {},
): CandidateWorkflowRecord {
  const now = new Date().toISOString();
  return {
    candidateId: id,
    workflowStatus: "Operator Approved",
    assignedRecruiter: "Taylor",
    assignedDM: "Field Ops",
    recommendedStage: "Hiring Recommendation",
    paperworkStatus: "not_sent",
    paperworkSentAt: null,
    signatureRequestId: null,
    notes: ["[P190_OPERATOR_APPROVED] operator approved"],
    history: [],
    updatedAt: now,
    createdAt: now,
    lastActionAt: now,
    progressionReason: null,
    nextActionNeeded: "Await Paperwork Needed authorization",
    recruiterOwnershipVersion: 1,
    ...overrides,
  } as CandidateWorkflowRecord;
}

describe("P191 paperwork release pilot", () => {
  it("fingerprints membership stably", () => {
    assert.equal(
      cohortFingerprint(["b", "a", "c"]),
      cohortFingerprint(["a", "c", "b"]),
    );
  });

  it("rejects candidates outside frozen cohort", () => {
    const cohort: P191FrozenCohort = {
      cohortId: "test",
      fingerprint: "fp",
      sourceCohortId: P191_REQUIRED_SOURCE_COHORT_ID,
      sourceFingerprint: P191_REQUIRED_SOURCE_FINGERPRINT,
      frozenAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      size: 1,
      immutable: true,
      members: [
        {
          candidateId: "inside",
          recruiter: "Taylor",
          jobId: "j1",
          jobLabel: null,
          city: null,
          state: null,
          currentStage: "Operator Approved",
          recommendedStage: "Hiring Recommendation",
          expectedNewStage: "Paperwork Needed",
          expectedOwnershipVersion: 1,
          productionRecordVersion: "v",
          idempotencyKey: "k",
          rollbackReference: "r",
          sourceCohortId: P191_REQUIRED_SOURCE_COHORT_ID,
        },
      ],
      sourcePhase: "P191",
      schemaVersion: 1,
    };
    assert.doesNotThrow(() => assertCohortImmutable(cohort, "inside"));
    assert.throws(() => assertCohortImmutable(cohort, "outside"));
  });

  it("validation requires Operator Approved and dry_run P184", () => {
    const member = {
      candidateId: "c1",
      recruiter: "Taylor",
      jobId: "j1",
      jobLabel: null,
      city: null,
      state: null,
      currentStage: "Operator Approved",
      recommendedStage: "Hiring Recommendation",
      expectedNewStage: "Paperwork Needed" as const,
      expectedOwnershipVersion: 1,
      productionRecordVersion: "v",
      idempotencyKey: "k",
      rollbackReference: "r",
      sourceCohortId: P191_REQUIRED_SOURCE_COHORT_ID,
    };
    const ok = validatePaperworkReleaseCandidate({
      member,
      workflow: fakeWf("c1"),
      jobResolved: true,
      p184Mode: "dry_run",
    });
    assert.equal(ok.ok, true);

    const notOa = validatePaperworkReleaseCandidate({
      member,
      workflow: fakeWf("c1", { workflowStatus: "Applied" }),
      jobResolved: true,
      p184Mode: "dry_run",
    });
    assert.equal(notOa.ok, false);

    const live = validatePaperworkReleaseCandidate({
      member,
      workflow: fakeWf("c1"),
      jobResolved: true,
      p184Mode: "live",
    });
    assert.equal(live.ok, false);
    assert.ok(live.blockers.some((b) => b.startsWith("p184_dry_run")));

    const envelope = validatePaperworkReleaseCandidate({
      member,
      workflow: fakeWf("c1", { signatureRequestId: "sig_123" }),
      jobResolved: true,
      p184Mode: "dry_run",
    });
    assert.equal(envelope.ok, false);
  });

  it("authorization disallows automation/scheduler/P187", () => {
    const members = Array.from({ length: P191_PILOT_SIZE }, (_, i) => ({
      candidateId: `z${i}`,
      recruiter: "Taylor",
      jobId: "j",
      jobLabel: null,
      city: null,
      state: null,
      currentStage: "Operator Approved",
      recommendedStage: "Hiring Recommendation",
      expectedNewStage: "Paperwork Needed" as const,
      expectedOwnershipVersion: 1,
      productionRecordVersion: "v",
      idempotencyKey: buildPaperworkIdempotencyKey(`z${i}`, "c", "j"),
      rollbackReference: "r",
      sourceCohortId: P191_REQUIRED_SOURCE_COHORT_ID,
    }));
    const cohort: P191FrozenCohort = {
      cohortId: "c",
      fingerprint: cohortFingerprint(members.map((m) => m.candidateId)),
      sourceCohortId: P191_REQUIRED_SOURCE_COHORT_ID,
      sourceFingerprint: P191_REQUIRED_SOURCE_FINGERPRINT,
      frozenAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      size: members.length,
      immutable: true,
      members,
      sourcePhase: "P191",
      schemaVersion: 1,
    };
    const auth = newP191Authorization({ cohort });
    assert.equal(auth.allowContinuousAutomation, false);
    assert.equal(auth.allowScheduler, false);
    assert.equal(auth.allowP187, false);
    assert.equal(auth.allowMel, false);
    assert.equal(auth.maxSends, 25);
  });
});
