import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveRemainingBatchContext } from "@/lib/controlled-live-send/resolve-remaining-batch-context";

describe("controlled-live-send remaining batch", () => {
  it("resolves full cohort before any sends", () => {
    const ctx = resolveRemainingBatchContext({
      readyToSend: 27,
      alreadySentCount: 0,
      sentCandidateIds: [],
    });
    assert.equal(ctx.batchMode, "full_cohort");
    assert.equal(ctx.requiredCandidateCount, 27);
  });
});
