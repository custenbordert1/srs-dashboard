import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dmAssignmentNeedsAttention,
  dmMatchesSuggestion,
  suggestDmForCandidate,
} from "@/lib/candidate-dm-suggest";

describe("candidate-dm-suggest", () => {
  it("suggests DM from candidate state via territory map", () => {
    assert.equal(suggestDmForCandidate({ candidateState: "TX" }), "Amy Harp");
    assert.equal(suggestDmForCandidate({ candidateState: "CA" }), "Shelly Debellis");
  });

  it("prefers job state over candidate state when provided", () => {
    assert.equal(
      suggestDmForCandidate({ candidateState: "TX", jobState: "OH" }),
      "Mindie Rodriguez",
    );
  });

  it("flags unassigned DM when suggestion exists", () => {
    assert.equal(dmAssignmentNeedsAttention("Unassigned", "Amy Harp"), true);
    assert.equal(dmMatchesSuggestion("Amy Harp", "Amy Harp"), true);
    assert.equal(dmAssignmentNeedsAttention("Amy Harp", "Amy Harp"), false);
  });
});
