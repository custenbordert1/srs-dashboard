import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBreezyCandidatesTimeoutMessage } from "@/lib/breezy-candidates-ops-log";

describe("breezy-candidates-ops-log", () => {
  it("detects timeout phrasing in error messages", () => {
    assert.equal(isBreezyCandidatesTimeoutMessage("Request timed out after 30s"), true);
    assert.equal(isBreezyCandidatesTimeoutMessage("AbortError: timeout"), true);
    assert.equal(isBreezyCandidatesTimeoutMessage("Breezy API key is not configured."), false);
  });
});
