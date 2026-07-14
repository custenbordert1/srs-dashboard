import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  P188_7_BATCH_SIZE,
  P188_7_PRIOR_RESTORED_EXPECTED,
  P188_7_SUB_BATCH_SIZE,
} from "@/lib/p188-7-recruiter-restore-batch";

describe("P188.7 recruiter restore batch", () => {
  it("targets 50 restores with 10-size sub-batches after 60 prior", () => {
    assert.equal(P188_7_BATCH_SIZE, 50);
    assert.equal(P188_7_SUB_BATCH_SIZE, 10);
    assert.equal(P188_7_PRIOR_RESTORED_EXPECTED, 60);
    assert.equal(P188_7_BATCH_SIZE % P188_7_SUB_BATCH_SIZE, 0);
  });
});
