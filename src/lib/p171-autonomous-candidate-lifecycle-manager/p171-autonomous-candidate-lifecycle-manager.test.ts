import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { P157CandidateDecision } from "@/lib/p157-recruiter-decision-engine/types";
import {
  canTransitionP171State,
  applyP171Transition,
} from "@/lib/p171-autonomous-candidate-lifecycle-manager/lifecycle-store";
import {
  categorizeP171Exception,
  createP171CandidateRecord,
  mapPaperworkToSignatureStatus,
  resolveP171LifecycleState,
  resolveP171StateFromWorkflow,
  shouldSkipP171Candidate,
  summarizeP171Candidates,
} from "@/lib/p171-autonomous-candidate-lifecycle-manager/map-lifecycle-state";
import { assertP171UsesExistingProductionPath } from "@/lib/p171-autonomous-candidate-lifecycle-manager/lifecycle-validation";
import { lifecycleStateLabel } from "@/lib/p171-autonomous-candidate-lifecycle-manager/presentation";

function decision(overrides: Partial<P157CandidateDecision> = {}): P157CandidateDecision {
  return {
    candidateId: "cand-1",
    candidateName: "Patricia Irby",
    email: "patricia.irby@aol.com",
    action: "Send Paperwork",
    confidence: 92,
    reasoning: ["High match", "Complete profile"],
    recruiter: "Jordan",
    dm: "DM1",
    state: "AZ",
    position: "Retail Merchandiser",
    project: null,
    workflowStatus: "Qualified",
    priorityScore: 85,
    signals: [],
    ...overrides,
  } as P157CandidateDecision;
}

describe("p171-autonomous-candidate-lifecycle-manager", () => {
  it("maps paperwork status to signature status", () => {
    assert.equal(mapPaperworkToSignatureStatus("not_sent"), "NOT_SENT");
    assert.equal(mapPaperworkToSignatureStatus("sent"), "SENT");
    assert.equal(mapPaperworkToSignatureStatus("viewed"), "VIEWED");
    assert.equal(mapPaperworkToSignatureStatus("signed"), "SIGNED");
    assert.equal(mapPaperworkToSignatureStatus("declined"), "DECLINED");
    assert.equal(mapPaperworkToSignatureStatus("failed"), "EXPIRED");
  });

  it("allows forward-only deterministic transitions", () => {
    assert.equal(canTransitionP171State("DISCOVERED", "APPROVED"), true);
    assert.equal(canTransitionP171State("APPROVED", "DISCOVERED"), false);
    assert.equal(canTransitionP171State("WAITING_SIGNATURE", "EXCEPTION"), true);
    assert.equal(canTransitionP171State("EXCEPTION", "APPROVED"), false);
    assert.equal(canTransitionP171State("COMPLETED", "READY_FOR_MEL"), false);
  });

  it("resolves APPROVED for high-confidence send paperwork", () => {
    const resolved = resolveP171LifecycleState({
      decision: decision(),
      workflow: null,
      minimumConfidence: 80,
      estimatedNextRun: null,
    });
    assert.equal(resolved.state, "APPROVED");
    assert.equal(resolved.exceptionCategory, null);
  });

  it("resolves EXCEPTION for duplicate candidates", () => {
    const resolved = resolveP171LifecycleState({
      decision: decision({ action: "Candidate Duplicate", confidence: 50 }),
      workflow: null,
      minimumConfidence: 80,
      estimatedNextRun: null,
    });
    assert.equal(resolved.state, "EXCEPTION");
    assert.equal(resolved.exceptionCategory, "duplicate");
  });

  it("resolves WAITING_SIGNATURE from workflow paperwork sent", () => {
    const state = resolveP171StateFromWorkflow({
      candidateId: "cand-1",
      workflowStatus: "Paperwork Sent",
      paperworkStatus: "viewed",
    } as Parameters<typeof resolveP171StateFromWorkflow>[0]);
    assert.equal(state, "WAITING_SIGNATURE");
  });

  it("creates candidate record with discovered timestamps", () => {
    const record = createP171CandidateRecord({
      decision: decision(),
      workflow: null,
      minimumConfidence: 80,
      estimatedNextRun: null,
      now: "2026-07-08T12:00:00.000Z",
    });
    assert.equal(record.candidateName, "Patricia Irby");
    assert.equal(record.state, "APPROVED");
    assert.equal(record.discoveredAt, "2026-07-08T12:00:00.000Z");
  });

  it("skips completed candidates in same cycle", () => {
    const record = createP171CandidateRecord({
      decision: decision(),
      workflow: null,
      minimumConfidence: 80,
      estimatedNextRun: null,
    });
    record.state = "COMPLETED";
    assert.equal(shouldSkipP171Candidate(record, "cycle-1"), true);
  });

  it("records auditable transitions", () => {
    const record = createP171CandidateRecord({
      decision: decision(),
      workflow: null,
      minimumConfidence: 80,
      estimatedNextRun: null,
    });
    const next = applyP171Transition({
      record,
      to: "PAPERWORK_SENT",
      cycleId: "cycle-1",
      reason: "Paperwork sent",
      source: "orchestrator",
      now: "2026-07-08T12:05:00.000Z",
    });
    assert.equal(next.state, "PAPERWORK_SENT");
    assert.equal(next.transitions.length, 1);
    assert.equal(next.transitions[0]?.auditable, true);
    assert.equal(next.paperworkSentAt, "2026-07-08T12:05:00.000Z");
  });

  it("summarizes lifecycle metrics", () => {
    const records = [
      createP171CandidateRecord({ decision: decision(), workflow: null, minimumConfidence: 80, estimatedNextRun: null }),
      createP171CandidateRecord({
        decision: decision({ candidateId: "cand-2", action: "Candidate Duplicate", confidence: 40 }),
        workflow: null,
        minimumConfidence: 80,
        estimatedNextRun: null,
      }),
    ];
    records[1] = { ...records[1]!, state: "EXCEPTION", exceptionCategory: "duplicate", exceptionReason: "dup" };
    const summary = summarizeP171Candidates(records);
    assert.equal(summary.total, 2);
    assert.equal(summary.approved, 1);
    assert.equal(summary.exceptions, 1);
  });

  it("categorizes missing email exceptions", () => {
    const cat = categorizeP171Exception(decision({ email: "", action: "Manual Review", confidence: 50 }));
    assert.equal(cat.category, "missing_email");
  });

  it("uses existing production path (no duplicate logic)", () => {
    const arch = assertP171UsesExistingProductionPath();
    assert.equal(arch.usesP159LiveCycle, true);
    assert.equal(arch.noDuplicateSendLogic, true);
    assert.equal(arch.noDuplicateReminderLogic, true);
  });

  it("formats lifecycle state labels", () => {
    assert.equal(lifecycleStateLabel("READY_FOR_MEL"), "READY FOR MEL");
  });
});
