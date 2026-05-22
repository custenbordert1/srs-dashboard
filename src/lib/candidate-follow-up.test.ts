import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  completeFollowUpActions,
  emptyRecruitingActions,
  markNeedsFollowUp,
} from "@/lib/candidate-recruiting-actions";

describe("candidate follow-up actions", () => {
  it("clears follow-up flag on completion", () => {
    const current = {
      ...emptyRecruitingActions(),
      needsFollowUp: true,
      updatedAt: "2026-05-20T00:00:00.000Z",
    };
    const done = completeFollowUpActions(current);
    assert.equal(done.needsFollowUp, false);
  });

  it("enables follow-up flag when marking needs follow-up", () => {
    const flagged = markNeedsFollowUp(emptyRecruitingActions());
    assert.equal(flagged.needsFollowUp, true);
  });
});
