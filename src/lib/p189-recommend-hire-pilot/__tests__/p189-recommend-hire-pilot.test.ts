import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertCohortImmutable,
  buildRecommendIdempotencyKey,
  cohortFingerprint,
  freezeP189PilotCohort,
  newP189Authorization,
  P189_PILOT_SIZE,
  type P189FrozenCohort,
} from "@/lib/p189-recommend-hire-pilot";
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
    assignedDM: null,
    recommendedStage: null,
    paperworkStatus: "not_sent",
    paperworkSentAt: null,
    signatureRequestId: null,
    notes: [],
    history: [],
    updatedAt: now,
    createdAt: now,
    lastActionAt: now,
    progressionReason: null,
    recruiterOwnershipVersion: 1,
    ...overrides,
  } as CandidateWorkflowRecord;
}

describe("P189 Recommend Hire pilot", () => {
  it("fingerprints cohorts immutably by member set", () => {
    const a = cohortFingerprint(["c2", "c1", "c3"]);
    const b = cohortFingerprint(["c1", "c3", "c2"]);
    assert.equal(a, b);
    assert.notEqual(a, cohortFingerprint(["c1", "c2"]));
  });

  it("rejects candidates outside frozen cohort", () => {
    const cohort: P189FrozenCohort = {
      cohortId: "test",
      fingerprint: "fp",
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
          city: "Ames",
          state: "IA",
          currentStage: "Applied",
          expectedNewStage: "Hiring Recommendation",
          productionRecordVersion: "v1",
          expectedOwnershipVersion: 1,
          idempotencyKey: "k",
          rollbackReference: "r",
        },
      ],
      sourcePhase: "P189",
      schemaVersion: 1,
    };
    assert.doesNotThrow(() => assertCohortImmutable(cohort, "inside"));
    assert.throws(() => assertCohortImmutable(cohort, "outside"));
  });

  it("freezes exactly 25 eligible Applied candidates", () => {
    const workflows = Array.from({ length: 30 }, (_, i) =>
      fakeWf(`cand-${String(i).padStart(3, "0")}`),
    );
    const enrichments = Object.fromEntries(
      workflows.map((w) => [
        w.candidateId,
        {
          jobId: `job-${w.candidateId}`,
          jobLabel: "CRS Specialist",
          city: "Ames",
          state: "IA",
          identityResolved: true,
        },
      ]),
    );
    const cohort = freezeP189PilotCohort({ workflows, enrichments });
    assert.equal(cohort.size, P189_PILOT_SIZE);
    assert.equal(cohort.members.length, 25);
    assert.equal(cohort.immutable, true);
    assert.equal(new Set(cohort.members.map((m) => m.candidateId)).size, 25);
  });

  it("idempotency keys are stable for same inputs", () => {
    const a = buildRecommendIdempotencyKey("c1", "cohort", "v1");
    const b = buildRecommendIdempotencyKey("c1", "cohort", "v1");
    assert.equal(a, b);
    assert.notEqual(a, buildRecommendIdempotencyKey("c1", "cohort", "v2"));
  });

  it("authorization disallows OA/paperwork/P187", () => {
    const workflows = Array.from({ length: 25 }, (_, i) => fakeWf(`x${i}`));
    const enrichments = Object.fromEntries(
      workflows.map((w) => [
        w.candidateId,
        {
          jobId: "j",
          jobLabel: "J",
          city: null,
          state: null,
          identityResolved: true,
        },
      ]),
    );
    const cohort = freezeP189PilotCohort({ workflows, enrichments });
    const auth = newP189Authorization({ cohort });
    assert.equal(auth.allowOperatorApproval, false);
    assert.equal(auth.allowPaperwork, false);
    assert.equal(auth.allowP187, false);
    assert.equal(auth.maxWrites, 25);
    assert.equal(auth.fingerprint, cohort.fingerprint);
  });
});
