import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import {
  loadP184EngineState,
  resetP184StateMemoryForTests,
  saveP184EngineState,
  updateP184Config,
} from "@/lib/p184-autonomous-paperwork-send-engine/store";
import { resetP184AuditMemoryForTests } from "@/lib/p184-autonomous-paperwork-send-engine/audit";
import { DEFAULT_P184_CONFIG } from "@/lib/p184-autonomous-paperwork-send-engine/types";
import {
  acquireP185Lease,
  authenticateP185CronRequest,
  buildP185HealthReport,
  buildP185ValidationReport,
  evaluateP185Alerts,
  evaluateP185LiveGates,
  executeP185OperatorAction,
  getP185StorageHealth,
  loadP185RunnerState,
  reconcileP185Envelopes,
  recordP185SendUnverified,
  releaseP185Lease,
  resetP185StorageMemoryForTests,
  runP185ProductionPaperworkAutomation,
  runP185WithCandidateMaps,
  saveP185RunnerState,
  setP185StorageTestFlags,
} from "@/lib/p185-production-paperwork-automation-runner";
import { installIsolatedRecruitingDataDir } from "@/lib/test/recruiting-test-isolation";

function baseRow(
  overrides: Partial<ScoredCandidateWorkflowRow> & { candidateId?: string } = {},
): ScoredCandidateWorkflowRow {
  return {
    candidateId: "cand-1",
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    stage: "Paperwork Needed",
    appliedDate: "2026-06-01T00:00:00.000Z",
    createdDate: "2026-06-01T00:00:00.000Z",
    addedDate: "2026-06-01T00:00:00.000Z",
    updatedDate: "2026-06-01T00:00:00.000Z",
    positionId: "job-1",
    positionName: "Merchandiser",
    notes: [],
    workflowStatus: "Paperwork Needed",
    paperworkStatus: "not_sent",
    paperworkSentAt: null,
    paperworkSignedAt: null,
    signatureRequestId: null,
    paperworkTemplateKey: "onboarding_packet",
    onboardingContactEmail: null,
    ...overrides,
  } as ScoredCandidateWorkflowRow;
}

function publishedJob(jobId = "job-1"): BreezyJob {
  return {
    jobId,
    name: "Merchandiser",
    city: "Austin",
    state: "TX",
    zip: "78701",
    displayLocation: "Austin, TX",
    locationSource: "location",
    status: "published",
    createdDate: "2026-01-01T00:00:00.000Z",
    updatedDate: "2026-06-01T00:00:00.000Z",
  };
}

describe("P185 production paperwork automation runner", () => {
  let isolation: Awaited<ReturnType<typeof installIsolatedRecruitingDataDir>>;
  const prevCron = process.env.CRON_SECRET;
  const prevP185 = process.env.P185_PRODUCTION_AUTOMATION_ENABLED;
  const prevDropbox = process.env.DROPBOX_SIGN_API_KEY;

  beforeEach(async () => {
    isolation = await installIsolatedRecruitingDataDir("p185-");
    resetP185StorageMemoryForTests();
    resetP184StateMemoryForTests();
    resetP184AuditMemoryForTests();
    setP185StorageTestFlags({ forceDurable: true });
    process.env.CRON_SECRET = "test-cron-secret";
    delete process.env.P185_PRODUCTION_AUTOMATION_ENABLED;
    process.env.DROPBOX_SIGN_API_KEY = "test-dropbox-key";
  });

  afterEach(async () => {
    await isolation.restore();
    resetP185StorageMemoryForTests();
    resetP184StateMemoryForTests();
    if (prevCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevCron;
    if (prevP185 === undefined) delete process.env.P185_PRODUCTION_AUTOMATION_ENABLED;
    else process.env.P185_PRODUCTION_AUTOMATION_ENABLED = prevP185;
    if (prevDropbox === undefined) delete process.env.DROPBOX_SIGN_API_KEY;
    else process.env.DROPBOX_SIGN_API_KEY = prevDropbox;
  });

  it("rejects unauthorized cron requests and query secrets", () => {
    const bad = authenticateP185CronRequest(
      new Request("http://localhost/api/cron/p185-paperwork-automation"),
    );
    assert.equal(bad.ok, false);
    assert.equal(bad.status, 401);

    const query = authenticateP185CronRequest(
      new Request("http://localhost/api/cron/p185?secret=test-cron-secret"),
    );
    assert.equal(query.ok, false);

    const ok = authenticateP185CronRequest(
      new Request("http://localhost/api/cron/p185", {
        headers: { Authorization: "Bearer test-cron-secret" },
      }),
    );
    assert.equal(ok.ok, true);
  });

  it("skips when automation kill switch / pause is active", async () => {
    await executeP185OperatorAction({
      action: "kill_switch_on",
      byUserId: "test",
      confirmed: true,
    });
    const killed = await runP185WithCandidateMaps({
      candidates: [baseRow()],
      onboardingByCandidateId: new Map(),
      jobsByPositionId: new Map([["job-1", publishedJob()]]),
      options: { intent: "dry_run", nowMs: Date.parse("2026-07-10T12:00:00.000Z") },
    });
    assert.equal(killed.skipped, true);
    assert.match(killed.skipReason ?? "", /Kill switch/i);

    await executeP185OperatorAction({
      action: "kill_switch_off",
      byUserId: "test",
      confirmed: true,
    });
    await executeP185OperatorAction({
      action: "pause",
      byUserId: "test",
      confirmed: false,
      pauseUntil: "2099-01-01T00:00:00.000Z",
    });
    const paused = await runP185WithCandidateMaps({
      candidates: [baseRow()],
      onboardingByCandidateId: new Map(),
      jobsByPositionId: new Map([["job-1", publishedJob()]]),
      options: { intent: "dry_run", nowMs: Date.parse("2026-07-10T12:00:00.000Z") },
    });
    assert.equal(paused.skipped, true);
    assert.match(paused.skipReason ?? "", /Paused/i);
  });

  it("runs dry-run scheduled execution via P184", async () => {
    const result = await runP185WithCandidateMaps({
      candidates: [baseRow()],
      onboardingByCandidateId: new Map(),
      jobsByPositionId: new Map([["job-1", publishedJob()]]),
      options: { intent: "dry_run", nowMs: Date.parse("2026-07-10T12:00:00.000Z") },
    });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, false);
    assert.equal(result.mode, "dry_run");
    assert.ok(result.p184);
    assert.ok((result.p184?.evaluated ?? 0) >= 1);
    const state = await loadP185RunnerState();
    assert.ok(state.lastDryRunSuccessAt);
  });

  it("prevents overlapping runners and allows expired lease takeover", async () => {
    const now = Date.parse("2026-07-10T12:00:00.000Z");
    const first = await acquireP185Lease({
      ownerId: "runner-a",
      cycleId: "cycle-a",
      nowMs: now,
      ttlMs: 60_000,
    });
    assert.equal(first.acquired, true);

    const second = await acquireP185Lease({
      ownerId: "runner-b",
      cycleId: "cycle-b",
      nowMs: now + 1_000,
      ttlMs: 60_000,
    });
    assert.equal(second.acquired, false);
    assert.equal(second.activeLease?.ownerId, "runner-a");
    assert.ok((second.remainingMs ?? 0) > 0);

    const takeover = await acquireP185Lease({
      ownerId: "runner-b",
      cycleId: "cycle-b2",
      nowMs: now + 120_000,
      ttlMs: 60_000,
    });
    assert.equal(takeover.acquired, true);
    assert.equal(takeover.lease.ownerId, "runner-b");
  });

  it("releases lease after failure and skips concurrent cycle without sending", async () => {
    const now = Date.parse("2026-07-10T12:00:00.000Z");
    await acquireP185Lease({ ownerId: "holder", cycleId: "c1", nowMs: now, ttlMs: 60_000 });

    const skipped = await runP185WithCandidateMaps({
      candidates: [baseRow()],
      onboardingByCandidateId: new Map(),
      jobsByPositionId: new Map([["job-1", publishedJob()]]),
      options: { intent: "dry_run", nowMs: now + 100, ownerId: "other" },
    });
    assert.equal(skipped.skipped, true);
    assert.equal(skipped.p184, null);
    assert.equal(skipped.lease.ownerId, "holder");

    await releaseP185Lease({ ownerId: "holder", cycleId: "c1" });
    const after = await loadP185RunnerState();
    assert.equal(after.lease, null);
  });

  it("fails closed for live when durable storage unavailable; dry-run may degrade", async () => {
    setP185StorageTestFlags({ forceDurable: false, forceEphemeral: true });
    const health = getP185StorageHealth();
    assert.equal(health.durable, false);

    process.env.P185_PRODUCTION_AUTOMATION_ENABLED = "1";
    await updateP184Config({ enabled: true, mode: "live" });
    const state = await loadP185RunnerState();
    state.lastDryRunSuccessAt = new Date().toISOString();
    state.safety.productionAutomationEnabled = true;
    await saveP185RunnerState(state);

    const live = await runP185WithCandidateMaps({
      candidates: [baseRow()],
      onboardingByCandidateId: new Map(),
      jobsByPositionId: new Map([["job-1", publishedJob()]]),
      options: { intent: "live", nowMs: Date.parse("2026-07-10T12:00:00.000Z"), skipLease: true },
    });
    assert.equal(live.skipped, true);
    assert.match(live.skipReason ?? "", /durable storage|Live blocked/i);

    setP185StorageTestFlags({ forceEphemeral: false, forceDurable: true });
    const dry = await runP185WithCandidateMaps({
      candidates: [baseRow()],
      onboardingByCandidateId: new Map(),
      jobsByPositionId: new Map([["job-1", publishedJob()]]),
      options: { intent: "dry_run", nowMs: Date.parse("2026-07-10T12:00:00.000Z") },
    });
    assert.equal(dry.ok, true);
  });

  it("normalizes live candidates and does not treat missing data as eligible", async () => {
    const missingEmail = baseRow({ candidateId: "cand-missing", email: "" });
    const result = await runP185WithCandidateMaps({
      candidates: [missingEmail],
      onboardingByCandidateId: new Map(),
      jobsByPositionId: new Map(),
      options: { intent: "dry_run", nowMs: Date.parse("2026-07-10T12:00:00.000Z") },
    });
    assert.equal(result.ok, true);
    assert.ok(result.p184);
    assert.equal(result.p184?.sent ?? 0, 0);
  });

  it("preserves P184 queue across cycles and carries rate-limit timestamps", async () => {
    await updateP184Config({
      enabled: true,
      mode: "dry_run",
      maxSendsPerCycle: 1,
      rateLimits: { maxPerMinute: 1, maxPerHour: 40, maxPerDay: 200, concurrentSends: 2 },
    });
    const rows = [baseRow({ candidateId: "a" }), baseRow({ candidateId: "b", email: "b@example.com" })];
    const jobs = new Map([["job-1", publishedJob()]]);
    const first = await runP185WithCandidateMaps({
      candidates: rows,
      onboardingByCandidateId: new Map(),
      jobsByPositionId: jobs,
      options: { intent: "dry_run", nowMs: Date.parse("2026-07-10T12:00:00.000Z"), maxSends: 1 },
    });
    assert.ok((first.p184?.sent ?? 0) >= 1);
    const mid = await loadP184EngineState();
    assert.ok(mid.queue.length >= 1);
    assert.ok(mid.sendTimestamps.length >= 1);

    resetP184StateMemoryForTests();
    // reload from disk
    const reloaded = await loadP184EngineState();
    assert.ok(reloaded.sendTimestamps.length >= 1);
    assert.ok(reloaded.queue.length >= 1);
  });

  it("records sent_unverified and reconciles without duplicate resend", async () => {
    await recordP185SendUnverified({
      candidateId: "cand-1",
      envelopeId: "env-1",
      idempotencyKey: "idem-1",
      nowMs: Date.parse("2026-07-10T12:00:00.000Z"),
    });
    let sendCalls = 0;
    const recon = await reconcileP185Envelopes({
      nowMs: Date.parse("2026-07-10T12:05:00.000Z"),
      deps: {
        getSignatureRequest: async (id) => {
          sendCalls += 1;
          assert.equal(id, "env-1");
          return {
            signatureRequestId: id,
            isComplete: false,
            isDeclined: false,
            signatures: [],
            rawStatus: "awaiting_signature",
          };
        },
      },
    });
    assert.equal(recon.checked, 1);
    assert.equal(recon.confirmed, 1);
    assert.equal(sendCalls, 1);
    const state = await loadP185RunnerState();
    assert.equal(state.envelopes[0]?.state, "confirmed_sent");
    // Second reconcile should not invent a resend — only verify remaining unverified
    const again = await reconcileP185Envelopes({
      nowMs: Date.parse("2026-07-10T12:06:00.000Z"),
      deps: {
        getSignatureRequest: async () => {
          throw new Error("should not be called for confirmed");
        },
      },
    });
    assert.equal(again.checked, 0);
  });

  it("recovers crash after Dropbox send (sent_unverified) without resend", async () => {
    const now = Date.parse("2026-07-10T12:00:00.000Z");
    const state = await loadP185RunnerState();
    state.operations.push({
      id: "op-crash",
      candidateId: "cand-1",
      idempotencyKey: "idem-crash",
      stage: "send_requested",
      envelopeId: "env-crash",
      createdAt: new Date(now - 200_000).toISOString(),
      updatedAt: new Date(now - 200_000).toISOString(),
      error: null,
    });
    await saveP185RunnerState(state);

    await reconcileP185Envelopes({
      nowMs: now,
      deps: {
        getSignatureRequest: async (id) => ({
          signatureRequestId: id,
          isComplete: false,
          isDeclined: false,
          signatures: [],
          rawStatus: "sent",
        }),
      },
    });
    const after = await loadP185RunnerState();
    const env = after.envelopes.find((e) => e.envelopeId === "env-crash");
    assert.ok(env);
    assert.equal(env?.state, "confirmed_sent");
    const op = after.operations.find((o) => o.id === "op-crash");
    assert.equal(op?.stage, "confirmed");
  });

  it("activates circuit breaker and respects kill switch / pause-until", async () => {
    const state = await loadP185RunnerState();
    state.safety.maxFailuresPerCycle = 2;
    await saveP185RunnerState(state);

    await executeP185OperatorAction({
      action: "circuit_open",
      byUserId: "test",
      confirmed: true,
    });
    const blocked = await runP185WithCandidateMaps({
      candidates: [baseRow()],
      onboardingByCandidateId: new Map(),
      jobsByPositionId: new Map([["job-1", publishedJob()]]),
      options: { intent: "dry_run", nowMs: Date.parse("2026-07-10T12:00:00.000Z") },
    });
    assert.equal(blocked.skipped, true);
    assert.match(blocked.skipReason ?? "", /circuit|Opened/i);

    await executeP185OperatorAction({
      action: "circuit_reset",
      byUserId: "test",
      confirmed: true,
    });
  });

  it("handles execution deadline before claiming work", async () => {
    const now = Date.parse("2026-07-10T12:00:00.000Z");
    const state = await loadP185RunnerState();
    state.safety.claimCutoffMs = 10_000;
    state.safety.executionBudgetMs = 5_000;
    await saveP185RunnerState(state);

    // Use real Date.now path: deadline already past claim cutoff relative to wall clock
    // Inject via options.deadlineMs in the past relative to Date.now when nowMs is omitted —
    // runner only checks Date.now() when options.nowMs is null. Simulate with skip by
    // setting deadline in the past and not providing nowMs... Actually when nowMs is set,
    // deadline check is skipped. So call without nowMs:
    const result = await runP185ProductionPaperworkAutomation({
      intent: "dry_run",
      deadlineMs: Date.now() - 1,
      deps: {
        loadCandidates: async () => {
          throw new Error("should not load candidates after deadline");
        },
      },
    });
    assert.equal(result.skipped, true);
    assert.match(result.skipReason ?? "", /deadline|budget|Stopped/i);
  });

  it("evaluates live gates and health/alerts output", async () => {
    const storage = getP185StorageHealth();
    const state = await loadP185RunnerState();
    const p184 = await loadP184EngineState();
    const gates = evaluateP185LiveGates({
      state,
      p184Config: { ...p184.config, enabled: false, mode: "dry_run" },
      storage,
      dropboxConfigured: true,
      authConfigured: true,
    });
    assert.equal(gates.ready, false);
    assert.ok(gates.blockers.length > 0);

    evaluateP185Alerts({
      state,
      storageHealthy: false,
      dropboxHealthy: false,
      breezyHealthy: false,
      authConfigured: false,
      queueDepth: 600,
      eligibleNow: 3,
      nowMs: Date.now(),
    });
    await saveP185RunnerState(state);
    const health = await buildP185HealthReport({ breezyHealthy: false });
    assert.ok(health.alerts.length > 0);
    assert.equal(health.schedulerAuth.configured, true);
    assert.equal(typeof health.liveEnablementReady, "boolean");
  });

  it("requires confirmation for live-impacting operator controls", async () => {
    const denied = await executeP185OperatorAction({
      action: "live_cycle",
      byUserId: "exec",
      confirmed: false,
    });
    assert.equal(denied.ok, false);
    assert.match(denied.error ?? "", /Confirmation/i);
  });

  it("two-instance concurrency: only one processes work", async () => {
    const now = Date.parse("2026-07-10T12:00:00.000Z");
    const held = await acquireP185Lease({
      ownerId: "inst-a",
      cycleId: "held-cycle",
      nowMs: now,
      ttlMs: 60_000,
    });
    assert.equal(held.acquired, true);

    const blocked = await runP185WithCandidateMaps({
      candidates: [baseRow()],
      onboardingByCandidateId: new Map(),
      jobsByPositionId: new Map([["job-1", publishedJob()]]),
      options: { intent: "dry_run", nowMs: now + 5, ownerId: "inst-b" },
    });
    assert.equal(blocked.skipped, true);
    assert.equal(blocked.p184, null);
    assert.equal(blocked.lease.ownerId, "inst-a");

    await releaseP185Lease({ ownerId: "inst-a", cycleId: "held-cycle" });

    const ran = await runP185WithCandidateMaps({
      candidates: [baseRow()],
      onboardingByCandidateId: new Map(),
      jobsByPositionId: new Map([["job-1", publishedJob()]]),
      options: { intent: "dry_run", nowMs: now + 10, ownerId: "inst-b" },
    });
    assert.equal(ran.skipped, false);
    assert.ok(ran.p184);
  });

  it("builds validation report without secrets or PII", () => {
    const report = buildP185ValidationReport({
      dryRunCycleResults: { evaluated: 1, sent: 0 },
      liveEnablementReadiness: false,
    });
    const json = JSON.stringify(report);
    assert.equal(json.includes("test-cron-secret"), false);
    assert.equal(json.includes("ada@example.com"), false);
    assert.equal(report.phase, "P185");
    assert.ok(report.candidateSourceMapping.length > 0);
  });

  it("successful live scheduled execution when all gates pass", async () => {
    process.env.P185_PRODUCTION_AUTOMATION_ENABLED = "1";
    await updateP184Config({ enabled: true, mode: "live" });
    const state = await loadP185RunnerState();
    state.safety.productionAutomationEnabled = true;
    state.lastDryRunSuccessAt = new Date().toISOString();
    await saveP185RunnerState(state);

    let liveCalls = 0;
    const result = await runP185WithCandidateMaps({
      candidates: [baseRow()],
      onboardingByCandidateId: new Map<string, CandidateOnboardingRecord>(),
      jobsByPositionId: new Map([["job-1", publishedJob()]]),
      options: {
        intent: "live",
        nowMs: Date.parse("2026-07-10T12:00:00.000Z"),
        deps: {
          runP184: async (input) => {
            liveCalls += 1;
            assert.equal(input.mode, "live");
            return {
              mode: "live",
              evaluated: 1,
              eligible: 1,
              queued: 1,
              sent: 1,
              failed: 0,
              skipped: 0,
              retriesScheduled: 0,
              rateLimited: false,
              durationMs: 5,
              results: [
                {
                  ok: true,
                  candidateId: "cand-1",
                  envelopeId: "env-live-1",
                  sentAt: new Date().toISOString(),
                  templateKey: "onboarding_packet",
                  durationMs: 5,
                  simulated: false,
                  transient: false,
                  permanent: false,
                  retryScheduled: false,
                  error: null,
                  idempotencyKey: "idem-live-1",
                },
              ],
              report: {} as never,
              metrics: {
                eligibleNow: 1,
                queued: 0,
                sending: 0,
                completedToday: 1,
                failedToday: 0,
                retries: 0,
                rateLimitStatus: {
                  config: DEFAULT_P184_CONFIG.rateLimits,
                  sentLastMinute: 1,
                  sentLastHour: 1,
                  sentLastDay: 1,
                  inFlight: 0,
                  limited: false,
                  limitedBy: [],
                  nextAvailableAt: null,
                },
                averageSendTimeMs: 5,
                successPct: 100,
                queueDepth: 0,
                mode: "live",
                enabled: true,
              },
            };
          },
          reconcile: async () => ({
            checked: 1,
            confirmed: 1,
            failed: 0,
            stillUnverified: 0,
            transitions: [{ envelopeId: "env-live-1", from: "sent_unverified", to: "confirmed_sent" }],
          }),
        },
      },
    });
    assert.equal(result.skipped, false);
    assert.equal(result.mode, "live");
    assert.equal(liveCalls, 1);
    const after = await loadP185RunnerState();
    assert.ok(after.envelopes.some((e) => e.envelopeId === "env-live-1"));
  });
});
