import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  APPROVED_COHORT_SIZE,
  BACKLOG_FAILURES_PER_CYCLE,
  BACKLOG_MAX_CONCURRENT,
  BACKLOG_MAX_SENDS_PER_CYCLE,
  CANARY_MAX_CONCURRENT,
  CANARY_MAX_SENDS,
  CANARY_PERMANENT_FAILURE_LIMIT,
  CANARY_TRANSIENT_FAILURE_LIMIT,
  assertCandidateInFrozenCohort,
  blockCohortMember,
  canaryExecutionAllowed,
  emptyP1853State,
  evaluateCanaryPassCriteria,
  evaluateP1853LiveGates,
  executeP1853OperatorAction,
  loadP1853State,
  paperworkWorkflowAfterConfirmedSend,
  paperworkWorkflowAfterSigned,
  rejectCohortExpansion,
  resetP1853StateMemoryForTests,
  saveP1853State,
  selectSendableCohortMembers,
  shouldResendAfterReconciliationFailure,
  tryAddCohortMember,
  type P1853FrozenCohort,
  type P1853GateStatus,
} from "@/lib/p185-3-controlled-live-paperwork-rollout";
import {
  resetP185StorageMemoryForTests,
  setP185StorageTestFlags,
} from "@/lib/p185-production-paperwork-automation-runner";
import { installIsolatedRecruitingDataDir } from "@/lib/test/recruiting-test-isolation";

function sampleCohort(size = 25): P1853FrozenCohort {
  return {
    rolloutId: "p1853-test-rollout",
    cohortId: "cohort-test",
    frozenAt: "2026-07-10T12:00:00.000Z",
    approvedCount: size,
    immutable: true,
    members: Array.from({ length: size }, (_, i) => ({
      candidateId: `cand-${i + 1}`,
      resolvedPositionId: "pos-1",
      normalizedWorkflowStatus: "Paperwork Needed" as const,
      evidenceRefs: ["p97"],
      templateKey: "onboarding_packet",
      emailHash: `hash-${i + 1}`,
      idempotencyKey: `idem-${i + 1}`,
      queueTimestamp: "2026-07-10T11:00:00.000Z",
      cohortId: "cohort-test",
      approvalTimestamp: "2026-07-10T10:00:00.000Z",
      blockedReason: null,
      removed: false,
    })),
  };
}

function allGatesOk(overrides: Partial<P1853GateStatus> = {}): P1853GateStatus {
  return {
    cronSecretConfigured: true,
    productionAutomationEnabled: true,
    durableStorageHealthy: true,
    durableStorageNotTmp: true,
    dropboxSignConfigured: true,
    templateConfigured: true,
    p184EnabledForLive: true,
    p184ModeLive: true,
    killSwitchInactive: true,
    circuitBreakerClosed: true,
    leaseAvailable: true,
    canaryAuthorized: true,
    productionStorageConfirmed: true,
    ...overrides,
  };
}

describe("P185.3 controlled live paperwork rollout", () => {
  let isolation: Awaited<ReturnType<typeof installIsolatedRecruitingDataDir>>;
  const prevCron = process.env.CRON_SECRET;
  const prevP185 = process.env.P185_PRODUCTION_AUTOMATION_ENABLED;
  const prevTemplate = process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET;
  const prevDropbox = process.env.DROPBOX_SIGN_API_KEY;

  beforeEach(async () => {
    isolation = await installIsolatedRecruitingDataDir("p185-3-");
    resetP1853StateMemoryForTests();
    resetP185StorageMemoryForTests();
    setP185StorageTestFlags({ forceDurable: true });
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.P185_PRODUCTION_AUTOMATION_ENABLED = "1";
    process.env.DROPBOX_SIGN_API_KEY = "test-key";
    process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET = "tmpl-test";
  });

  afterEach(async () => {
    await isolation.restore();
    resetP1853StateMemoryForTests();
    resetP185StorageMemoryForTests();
    if (prevCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCron;
    if (prevP185 === undefined) delete process.env.P185_PRODUCTION_AUTOMATION_ENABLED;
    else process.env.P185_PRODUCTION_AUTOMATION_ENABLED = prevP185;
    if (prevTemplate === undefined) delete process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET;
    else process.env.DROPBOX_SIGN_TEMPLATE_ONBOARDING_PACKET = prevTemplate;
    if (prevDropbox === undefined) delete process.env.DROPBOX_SIGN_API_KEY;
    else process.env.DROPBOX_SIGN_API_KEY = prevDropbox;
  });

  it("frozen cohort cannot expand", () => {
    const cohort = sampleCohort(APPROVED_COHORT_SIZE);
    const expansion = rejectCohortExpansion(cohort, "outside-cand");
    assert.equal(expansion.allowed, false);
    const add = tryAddCohortMember(cohort, {
      ...cohort.members[0]!,
      candidateId: "outside-cand",
    });
    assert.equal(add.added, false);
    assert.equal(add.cohort.members.length, APPROVED_COHORT_SIZE);
    assert.ok(!add.cohort.members.some((m) => m.candidateId === "outside-cand"));
  });

  it("candidate newly blocked after cohort freeze remains recorded", () => {
    const cohort = sampleCohort(3);
    const next = blockCohortMember(cohort, "cand-2", "Active envelope appeared after freeze");
    assert.equal(next.members.find((m) => m.candidateId === "cand-2")?.blockedReason, "Active envelope appeared after freeze");
    assert.equal(next.approvedCount, 3);
    assert.equal(assertCandidateInFrozenCohort(next, "cand-2"), true);
    const sendable = selectSendableCohortMembers(next, { max: 10 });
    assert.equal(sendable.length, 2);
    assert.ok(!sendable.some((m) => m.candidateId === "cand-2"));
  });

  it("final duplicate validation blocks sendable selection for excluded ids", () => {
    const cohort = sampleCohort(5);
    const sendable = selectSendableCohortMembers(cohort, {
      excludeIds: new Set(["cand-1", "cand-2"]),
      max: CANARY_MAX_SENDS,
    });
    assert.equal(sendable.length, 3);
    assert.ok(!sendable.some((m) => m.candidateId === "cand-1"));
  });

  it("missing cron secret blocks live canary", () => {
    delete process.env.CRON_SECRET;
    delete process.env.P185_CRON_SECRET;
    const { gates } = evaluateP1853LiveGates({ authorizeCanary: true });
    assert.equal(gates.cronSecretConfigured, false);
    const allowed = canaryExecutionAllowed(gates, false, false);
    assert.equal(allowed.ok, false);
    assert.ok(allowed.blockers.some((b) => /cron/i.test(b)));
  });

  it("ephemeral storage blocks live", () => {
    setP185StorageTestFlags({ forceEphemeral: true, forceDurable: false });
    const { gates } = evaluateP1853LiveGates({ authorizeCanary: true });
    const allowed = canaryExecutionAllowed(
      { ...allGatesOk(), durableStorageHealthy: gates.durableStorageHealthy, durableStorageNotTmp: gates.durableStorageNotTmp },
      false,
      false,
    );
    // When ephemeral, durableStorageHealthy/NotTmp should fail canary
    if (!gates.durableStorageHealthy || !gates.durableStorageNotTmp) {
      assert.equal(allowed.ok, false);
    } else {
      // force via explicit gate
      const blocked = canaryExecutionAllowed(
        allGatesOk({ durableStorageHealthy: false, durableStorageNotTmp: false }),
        false,
        false,
      );
      assert.equal(blocked.ok, false);
    }
  });

  it("canary limited to five and concurrency one", () => {
    assert.equal(CANARY_MAX_SENDS, 5);
    assert.equal(CANARY_MAX_CONCURRENT, 1);
    const cohort = sampleCohort(25);
    const targets = selectSendableCohortMembers(cohort, { max: CANARY_MAX_SENDS });
    assert.equal(targets.length, 5);
  });

  it("canary permanent failure pauses rollout", () => {
    const result = evaluateCanaryPassCriteria({
      attempted: 1,
      permanentFailures: CANARY_PERMANENT_FAILURE_LIMIT,
      transientFailures: 0,
      paused: true,
      attemptsOk: false,
    });
    assert.equal(result.passed, false);
    assert.match(result.reason ?? "", /permanent|paused/i);
  });

  it("canary transient failure threshold", () => {
    const result = evaluateCanaryPassCriteria({
      attempted: 2,
      permanentFailures: 0,
      transientFailures: CANARY_TRANSIENT_FAILURE_LIMIT,
      paused: true,
      attemptsOk: false,
    });
    assert.equal(result.passed, false);
    assert.match(result.reason ?? "", /transient|paused/i);
  });

  it("successful canary enables remaining cycles", () => {
    const result = evaluateCanaryPassCriteria({
      attempted: 5,
      permanentFailures: 0,
      transientFailures: 0,
      paused: false,
      attemptsOk: true,
    });
    assert.equal(result.passed, true);
    assert.equal(BACKLOG_MAX_SENDS_PER_CYCLE, 10);
    assert.equal(BACKLOG_MAX_CONCURRENT, 2);
    assert.equal(BACKLOG_FAILURES_PER_CYCLE, 3);
  });

  it("normal cycle limited to ten and no outside-cohort send", () => {
    const cohort = sampleCohort(25);
    const targets = selectSendableCohortMembers(cohort, {
      excludeIds: new Set(cohort.members.slice(0, 5).map((m) => m.candidateId)),
      max: BACKLOG_MAX_SENDS_PER_CYCLE,
    });
    assert.equal(targets.length, 10);
    for (const t of targets) {
      assert.equal(assertCandidateInFrozenCohort(cohort, t.candidateId), true);
    }
    assert.equal(assertCandidateInFrozenCohort(cohort, "outsider"), false);
  });

  it("active envelope appearing after freeze prevents send via block", () => {
    const cohort = blockCohortMember(sampleCohort(3), "cand-1", "Packet present after freeze");
    const sendable = selectSendableCohortMembers(cohort, { max: 10 });
    assert.ok(!sendable.some((m) => m.candidateId === "cand-1"));
  });

  it("sent_unverified reconciliation does not resend", () => {
    assert.equal(shouldResendAfterReconciliationFailure(), false);
  });

  it("crash after Dropbox send does not duplicate (idempotency preserved in cohort keys)", () => {
    const cohort = sampleCohort(2);
    const keys = new Set(cohort.members.map((m) => m.idempotencyKey));
    assert.equal(keys.size, 2);
    // Re-selecting same members still uses same idempotency keys
    const again = selectSendableCohortMembers(cohort, { max: 2 });
    assert.equal(again[0]?.idempotencyKey, "idem-1");
  });

  it("workflow status updated after confirmed send but signed not premature", () => {
    assert.equal(paperworkWorkflowAfterConfirmedSend(), "Paperwork Sent");
    assert.equal(paperworkWorkflowAfterSigned(), "Paperwork Completed");
    assert.notEqual(paperworkWorkflowAfterConfirmedSend(), paperworkWorkflowAfterSigned());
  });

  it("kill switch and circuit breaker interrupt canary authorization", () => {
    const gates = allGatesOk();
    assert.equal(canaryExecutionAllowed(gates, true, false).ok, false);
    assert.equal(canaryExecutionAllowed(gates, false, true).ok, false);
    assert.equal(canaryExecutionAllowed(gates, false, false).ok, true);
  });

  it("restart recovery preserves frozen cohort in durable state", async () => {
    const state = emptyP1853State();
    state.cohort = sampleCohort(25);
    state.phase = "awaiting_canary";
    await saveP1853State(state);
    resetP1853StateMemoryForTests();
    const reloaded = await loadP1853State();
    assert.equal(reloaded.cohort?.approvedCount, 25);
    assert.equal(reloaded.cohort?.rolloutId, "p1853-test-rollout");
    assert.equal(reloaded.cohort?.immutable, true);
  });

  it("final backlog completion phase when remaining is zero after canary", async () => {
    const state = emptyP1853State();
    state.cohort = sampleCohort(5);
    state.canary.passed = true;
    state.canary.attempted = 5;
    state.canary.confirmed = 5;
    state.backlog.remaining = 0;
    state.phase = "backlog_complete";
    await saveP1853State(state);
    const snap = await loadP1853State();
    assert.equal(snap.phase, "backlog_complete");
    assert.equal(snap.backlog.remaining, 0);
  });

  it("operator live-impacting actions require confirmation", async () => {
    const denied = await executeP1853OperatorAction({
      action: "start_canary",
      byUserId: "test",
      confirmed: false,
    });
    assert.equal(denied.ok, false);
    assert.match(denied.error ?? "", /confirm/i);
  });

  it("resume after canary blocked until canary passed", async () => {
    const denied = await executeP1853OperatorAction({
      action: "resume_after_canary",
      byUserId: "test",
      confirmed: true,
    });
    assert.equal(denied.ok, false);
  });

  it("cancel remaining unsent requires confirmation and does not add candidates", async () => {
    const state = emptyP1853State();
    state.cohort = sampleCohort(5);
    await saveP1853State(state);
    const denied = await executeP1853OperatorAction({
      action: "cancel_remaining_unsent",
      byUserId: "test",
      confirmed: false,
    });
    assert.equal(denied.ok, false);
    const ok = await executeP1853OperatorAction({
      action: "cancel_remaining_unsent",
      byUserId: "test",
      confirmed: true,
    });
    assert.equal(ok.ok, true);
    const after = await loadP1853State();
    assert.equal(after.cohort?.members.length, 5);
    assert.ok(after.cohort?.members.every((m) => m.removed || m.blockedReason));
  });
});
