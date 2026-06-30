import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveRemainingBatchContext, isValidBatchConfirmation } from "@/lib/controlled-live-send/resolve-remaining-batch-context";
import { P100_REMAINING_BATCH_PHRASE } from "@/lib/controlled-live-send/types";

describe("post-live-send-verification (P103)", () => {
  it("uses remaining batch phrase and count after first send", () => {
    const ctx = resolveRemainingBatchContext({
      readyToSend: 26,
      alreadySentCount: 1,
      sentCandidateIds: ["6d548b240ab0"],
    });
    assert.equal(ctx.batchMode, "remaining_cohort");
    assert.equal(ctx.requiredConfirmationPhrase, P100_REMAINING_BATCH_PHRASE);
    assert.equal(ctx.requiredCandidateCount, 26);
    assert.deepEqual(ctx.excludedCandidateIds, ["6d548b240ab0"]);

    assert.equal(
      isValidBatchConfirmation({
        confirmationPhrase: P100_REMAINING_BATCH_PHRASE,
        candidateCount: 26,
        readyToSend: 26,
        alreadySentCount: 1,
        sentCandidateIds: ["6d548b240ab0"],
      }),
      true,
    );
  });

  it("rejects full-cohort phrase when one already sent", () => {
    assert.equal(
      isValidBatchConfirmation({
        confirmationPhrase: "SEND 27 PAPERWORK PACKETS",
        candidateCount: 27,
        readyToSend: 26,
        alreadySentCount: 1,
        sentCandidateIds: ["6d548b240ab0"],
      }),
      false,
    );
  });
});
