import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cohortFingerprint,
  assertCohortImmutable,
} from "@/lib/p188-5-recruiter-restore-canary";
import type { P1885FrozenCohort } from "@/lib/p188-5-recruiter-restore-canary/types";
import { decideOwnershipWrite } from "@/lib/p188-4-recruiter-ownership-durability/precedence";

describe("P188.5 recruiter restore canary", () => {
  it("fingerprints cohorts immutably", () => {
    const a = cohortFingerprint(["c2", "c1"], ["Taylor", "Alex"]);
    const b = cohortFingerprint(["c1", "c2"], ["Taylor", "Alex"]);
    assert.equal(a, b);
    assert.notEqual(a, cohortFingerprint(["c1", "c2"], ["Alex", "Taylor"]));
  });

  it("rejects candidates outside frozen cohort", () => {
    const cohort: P1885FrozenCohort = {
      cohortId: "test",
      fingerprint: "fp",
      frozenAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      size: 1,
      immutable: true,
      members: [
        {
          candidateId: "inside",
          proposedRecruiter: "Taylor",
          evidenceReference: "e",
          sourceTimestamp: new Date().toISOString(),
          expectedOwnershipVersion: 0,
          expectedRecruiter: "Unassigned",
          idempotencyKey: "k",
          rollbackReference: "r",
          jobResolved: true,
          workflowStatus: "Applied",
          bypass: false,
        },
      ],
    };
    assert.doesNotThrow(() => assertCohortImmutable(cohort, "inside"));
    assert.throws(() => assertCohortImmutable(cohort, "outside"));
  });

  it("operator_confirmed_historical_restore is sticky against Unassigned ingestion", () => {
    const d = decideOwnershipWrite({
      incomingRecruiter: "Unassigned",
      incomingSource: "unassigned",
      existingRecruiter: "Taylor",
      existingSource: "operator_confirmed_historical_restore",
    });
    assert.equal(d.recruiter, "Taylor");
    assert.equal(d.blocked, true);
  });
});
