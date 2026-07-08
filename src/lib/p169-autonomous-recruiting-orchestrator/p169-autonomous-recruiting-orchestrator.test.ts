import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapP157ToP169Outcome } from "@/lib/p169-autonomous-recruiting-orchestrator/map-candidate-outcome";
import {
  isP169OrchestratorEnabled,
  resolveP169EnvConfig,
} from "@/lib/p169-autonomous-recruiting-orchestrator/orchestrator-config";
import { assertP169UsesExistingProductionPath } from "@/lib/p169-autonomous-recruiting-orchestrator/orchestrator-validation";
import type { P157CandidateDecision } from "@/lib/p157-recruiter-decision-engine/types";

function baseDecision(
  overrides: Partial<P157CandidateDecision> = {},
): P157CandidateDecision {
  return {
    candidateId: "c1",
    candidateName: "Test Candidate",
    email: "test@example.com",
    action: "Send Paperwork",
    confidence: 88,
    reasoning: ["Eligible for paperwork"],
    recruiter: "Recruiter A",
    dm: "DM A",
    position: "Sales Rep",
    positionId: "p1",
    project: null,
    territory: "West",
    state: "CA",
    workflowStatus: "Applied",
    priorityScore: 80,
    priorityLevel: "high",
    openDemand: 2,
    daysInPipeline: 3,
    signals: [],
    ...overrides,
  };
}

describe("p169-autonomous-recruiting-orchestrator", () => {
  it("defaults disabled without env gate", () => {
    assert.equal(isP169OrchestratorEnabled({}), false);
    assert.equal(resolveP169EnvConfig({}).enabled, false);
  });

  it("maps high-confidence send paperwork to AUTO_SEND_PAPERWORK", () => {
    const eval_ = mapP157ToP169Outcome(baseDecision(), 80, null);
    assert.equal(eval_.outcome, "AUTO_SEND_PAPERWORK");
    assert.equal(eval_.confidence, 88);
  });

  it("maps low confidence to NEEDS_MANUAL_REVIEW", () => {
    const eval_ = mapP157ToP169Outcome(baseDecision({ confidence: 60 }), 80, null);
    assert.equal(eval_.outcome, "NEEDS_MANUAL_REVIEW");
    assert.ok(eval_.blockingFactors.some((f) => f.includes("Confidence")));
  });

  it("maps duplicate to NEEDS_MANUAL_REVIEW", () => {
    const eval_ = mapP157ToP169Outcome(
      baseDecision({ action: "Candidate Duplicate", confidence: 94 }),
      80,
      null,
    );
    assert.equal(eval_.outcome, "NEEDS_MANUAL_REVIEW");
  });

  it("maps wait for candidate to WAIT_SIGNATURE", () => {
    const eval_ = mapP157ToP169Outcome(
      baseDecision({ action: "Wait For Candidate", confidence: 78 }),
      80,
      null,
    );
    assert.equal(eval_.outcome, "WAIT_SIGNATURE");
  });

  it("maps ready for MEL", () => {
    const eval_ = mapP157ToP169Outcome(
      baseDecision({ action: "Ready For MEL", confidence: 90 }),
      80,
      null,
    );
    assert.equal(eval_.outcome, "READY_FOR_MEL");
  });

  it("uses P159 production path only", () => {
    const path = assertP169UsesExistingProductionPath();
    assert.equal(path.usesP159LiveCycle, true);
    assert.equal(path.noNewSendImplementation, true);
    assert.equal(path.noContinuousModeAutoEnable, true);
  });
});
