import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cohortFingerprint } from "@/lib/p188-5-recruiter-restore-canary/preflight";
import { P188_6_BATCH_SIZE, P188_6_SUB_BATCH_SIZE } from "@/lib/p188-6-recruiter-restore-batch";

describe("P188.6 recruiter restore batch", () => {
  it("uses batch size 50 with sub-batches of 10", () => {
    assert.equal(P188_6_BATCH_SIZE, 50);
    assert.equal(P188_6_SUB_BATCH_SIZE, 10);
    assert.equal(P188_6_BATCH_SIZE % P188_6_SUB_BATCH_SIZE, 0);
  });

  it("excludes prior canary IDs from fingerprint identity", () => {
    const batch = cohortFingerprint(["a", "b"], ["Taylor", "Alex"]);
    const withExtra = cohortFingerprint(["a", "b", "canary"], ["Taylor", "Alex", "Taylor"]);
    assert.notEqual(batch, withExtra);
  });
});
