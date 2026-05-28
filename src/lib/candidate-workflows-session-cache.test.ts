import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clearCandidateWorkflowsSessionCache,
  peekCandidateWorkflowsSessionCache,
  shouldUseCandidateWorkflowsSessionCache,
  storeCandidateWorkflowsSessionCache,
} from "@/lib/candidate-workflows-session-cache";

describe("candidate workflows session cache", () => {
  it("reuses workflows within session until force refresh", () => {
    clearCandidateWorkflowsSessionCache();
    storeCandidateWorkflowsSessionCache({
      ok: true,
      workflows: { "c-1": { candidateId: "c-1" } as never },
    });
    assert.equal(shouldUseCandidateWorkflowsSessionCache(false), true);
    assert.equal(shouldUseCandidateWorkflowsSessionCache(true), false);
    assert.ok(peekCandidateWorkflowsSessionCache()?.workflows);
  });
});
