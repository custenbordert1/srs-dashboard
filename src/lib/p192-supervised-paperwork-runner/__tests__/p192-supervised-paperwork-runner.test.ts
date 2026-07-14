import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertNoUpstreamAutomation,
  evaluateP192Eligibility,
  P192_INTERVAL_MS,
  P192_MAX_FAILURES_PER_CYCLE,
  P192_MAX_SENDS_PER_CYCLE,
  P192_RATE_LIMITS,
  assertProductionTestModeOff,
  applyP192ProductionDropboxEnv,
} from "@/lib/p192-supervised-paperwork-runner";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { DEFAULT_P184_CONFIG } from "@/lib/p184-autonomous-paperwork-send-engine/types";
import { evaluateP184RateLimit, canAcquireSendSlot } from "@/lib/p184-autonomous-paperwork-send-engine/rateLimiter";

function row(overrides: Partial<ScoredCandidateWorkflowRow> = {}): ScoredCandidateWorkflowRow {
  return {
    candidateId: "c1",
    firstName: "A",
    lastName: "B",
    email: "a@example.com",
    positionId: "job1",
    positionName: "Merchandiser",
    workflowStatus: "Paperwork Needed",
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    assignedRecruiter: "Taylor",
    recommendedStage: "Hiring Recommendation",
    notes: ["[P190_OPERATOR_APPROVED] operator approved"],
    stage: "Paperwork Needed",
    nextActionNeeded: "Send paperwork",
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

function wf(overrides: Partial<CandidateWorkflowRecord> = {}): CandidateWorkflowRecord {
  return {
    candidateId: "c1",
    workflowStatus: "Paperwork Needed",
    assignedRecruiter: "Taylor",
    recommendedStage: "Hiring Recommendation",
    notes: ["[P190_OPERATOR_APPROVED] operator approved"],
    paperworkStatus: "not_sent",
    signatureRequestId: null,
    paperworkSentAt: null,
    history: [],
    nextActionNeeded: "Send paperwork",
    progressionReason: null,
    recruiterOwnershipVersion: 1,
    ...overrides,
  } as CandidateWorkflowRecord;
}

describe("P192 supervised paperwork runner", () => {
  it("uses a 10-minute interval and first-cycle-friendly send limits", () => {
    assert.equal(P192_INTERVAL_MS, 10 * 60 * 1000);
    assert.equal(P192_MAX_SENDS_PER_CYCLE, 10);
    assert.equal(P192_MAX_FAILURES_PER_CYCLE, 3);
    assert.equal(P192_RATE_LIMITS.maxPerMinute, 4);
    assert.equal(P192_RATE_LIMITS.maxPerHour, 40);
    assert.equal(P192_RATE_LIMITS.maxPerDay, 200);
    assert.equal(P192_RATE_LIMITS.concurrentSends, 2);
  });

  it("requires Paperwork Needed + recommend hire + operator approval", () => {
    const ok = evaluateP192Eligibility({
      row: row(),
      workflow: wf(),
      onboarding: null,
      job: null,
      config: { ...DEFAULT_P184_CONFIG, mode: "live", enabled: true },
      queueItems: [],
      completedIdempotencyKeys: new Set(),
    });
    assert.equal(ok.eligible, true);

    const notPn = evaluateP192Eligibility({
      row: row({ workflowStatus: "Applied" }),
      workflow: wf({ workflowStatus: "Applied" }),
      onboarding: null,
      job: null,
      config: { ...DEFAULT_P184_CONFIG, mode: "live", enabled: true },
      queueItems: [],
      completedIdempotencyKeys: new Set(),
    });
    assert.equal(notPn.eligible, false);
    assert.ok(notPn.blockers.includes("authoritative_state_not_paperwork_needed"));

    const noRec = evaluateP192Eligibility({
      row: row({ recommendedStage: null }),
      workflow: wf({ recommendedStage: null }),
      onboarding: null,
      job: null,
      config: { ...DEFAULT_P184_CONFIG, mode: "live", enabled: true },
      queueItems: [],
      completedIdempotencyKeys: new Set(),
    });
    assert.equal(noRec.eligible, false);

    const noOa = evaluateP192Eligibility({
      row: row({ notes: [] }),
      workflow: wf({ notes: [] }),
      onboarding: null,
      job: null,
      config: { ...DEFAULT_P184_CONFIG, mode: "live", enabled: true },
      queueItems: [],
      completedIdempotencyKeys: new Set(),
    });
    assert.equal(noOa.eligible, false);

    const priorEnv = evaluateP192Eligibility({
      row: row({ signatureRequestId: "sig_1" }),
      workflow: wf({ signatureRequestId: "sig_1" }),
      onboarding: null,
      job: null,
      config: { ...DEFAULT_P184_CONFIG, mode: "live", enabled: true },
      queueItems: [],
      completedIdempotencyKeys: new Set(),
    });
    assert.equal(priorEnv.eligible, false);
  });

  it("does not automate recommendations, approvals, or MEL", () => {
    const a = assertNoUpstreamAutomation();
    assert.equal(a.recommendationsAutomated, 0);
    assert.equal(a.approvalsAutomated, 0);
    assert.equal(a.melWrites, 0);
  });

  it("enforces production test_mode=false after env apply", () => {
    applyP192ProductionDropboxEnv();
    assert.equal((process.env as Record<string, string | undefined>).NODE_ENV, "production");
    assert.equal(process.env.DROPBOX_SIGN_TEST_MODE, "false");
    // Without API key, config is null — gate fails closed
    const prev = process.env.DROPBOX_SIGN_API_KEY;
    delete process.env.DROPBOX_SIGN_API_KEY;
    const gate = assertProductionTestModeOff();
    assert.equal(gate.ok, false);
    if (prev) process.env.DROPBOX_SIGN_API_KEY = prev;
  });

  it("rate limiter blocks over 4/minute", () => {
    const now = Date.now();
    const stamps = Array.from({ length: 4 }, (_, i) => new Date(now - i * 1000).toISOString());
    const status = evaluateP184RateLimit({
      config: { ...P192_RATE_LIMITS },
      sendTimestamps: stamps,
      inFlight: 0,
      nowMs: now,
    });
    assert.equal(canAcquireSendSlot(status), false);
  });
});
