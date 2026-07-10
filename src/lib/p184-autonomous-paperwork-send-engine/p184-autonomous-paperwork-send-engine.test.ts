import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import {
  buildP184IdempotencyKey,
  evaluateP184Eligibility,
  isPermanentSendFailure,
} from "@/lib/p184-autonomous-paperwork-send-engine/evaluator";
import {
  canAcquireSendSlot,
  evaluateP184RateLimit,
} from "@/lib/p184-autonomous-paperwork-send-engine/rateLimiter";
import {
  computeP184Priority,
  runP184AutonomousPaperworkSendEngine,
  sortP184Queue,
} from "@/lib/p184-autonomous-paperwork-send-engine/engine";
import { listP184AuditEvents, resetP184AuditMemoryForTests } from "@/lib/p184-autonomous-paperwork-send-engine/audit";
import {
  loadP184EngineState,
  resetP184StateMemoryForTests,
  saveP184EngineState,
} from "@/lib/p184-autonomous-paperwork-send-engine/store";
import {
  DEFAULT_P184_CONFIG,
  type P184QueueItem,
} from "@/lib/p184-autonomous-paperwork-send-engine/types";
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
    locationSource: "missing",
    status: "published",
    createdDate: "2026-01-01T00:00:00.000Z",
    updatedDate: "2026-01-01T00:00:00.000Z",
  };
}

describe("P184 autonomous paperwork send engine", () => {
  let isolation: Awaited<ReturnType<typeof installIsolatedRecruitingDataDir>>;

  beforeEach(async () => {
    isolation = await installIsolatedRecruitingDataDir("p184-");
    resetP184StateMemoryForTests();
    resetP184AuditMemoryForTests();
  });

  afterEach(async () => {
    await isolation.restore();
    resetP184StateMemoryForTests();
    resetP184AuditMemoryForTests();
  });

  it("passes eligibility when all gates succeed", () => {
    const result = evaluateP184Eligibility({
      row: baseRow(),
      onboarding: null,
      job: publishedJob(),
      config: DEFAULT_P184_CONFIG,
      queueItems: [],
      completedIdempotencyKeys: new Set(),
    });
    assert.equal(result.eligible, true);
    assert.equal(result.rejectionReasons.length, 0);
    assert.ok(result.idempotencyKey.startsWith("p184:"));
  });

  it("rejects when eligibility gates fail", () => {
    const missingEmail = evaluateP184Eligibility({
      row: baseRow({ email: "" }),
      onboarding: null,
      job: publishedJob(),
      config: DEFAULT_P184_CONFIG,
      queueItems: [],
      completedIdempotencyKeys: new Set(),
    });
    assert.equal(missingEmail.eligible, false);
    assert.ok(missingEmail.gates.some((g) => g.id === "valid_email" && !g.passed));

    const archived = evaluateP184Eligibility({
      row: baseRow({ notes: ["archived candidate"] }),
      onboarding: null,
      job: publishedJob(),
      config: DEFAULT_P184_CONFIG,
      queueItems: [],
      completedIdempotencyKeys: new Set(),
    });
    assert.ok(archived.gates.some((g) => g.id === "not_archived" && !g.passed));

    const hired = evaluateP184Eligibility({
      row: baseRow({ workflowStatus: "Active Rep" }),
      onboarding: null,
      job: publishedJob(),
      config: DEFAULT_P184_CONFIG,
      queueItems: [],
      completedIdempotencyKeys: new Set(),
    });
    assert.ok(hired.gates.some((g) => g.id === "not_hired" && !g.passed));

    const pending = evaluateP184Eligibility({
      row: baseRow({
        paperworkStatus: "sent",
        signatureRequestId: "sig-1",
        workflowStatus: "Paperwork Needed",
      }),
      onboarding: null,
      job: publishedJob(),
      config: DEFAULT_P184_CONFIG,
      queueItems: [],
      completedIdempotencyKeys: new Set(),
    });
    assert.ok(pending.gates.some((g) => g.id === "no_paperwork_pending" && !g.passed));

    const completed = evaluateP184Eligibility({
      row: baseRow({
        paperworkStatus: "signed",
        workflowStatus: "Paperwork Needed",
      }),
      onboarding: null,
      job: publishedJob(),
      config: DEFAULT_P184_CONFIG,
      queueItems: [],
      completedIdempotencyKeys: new Set(),
    });
    assert.ok(completed.gates.some((g) => g.id === "no_paperwork_completed" && !g.passed));

    const inactiveJob = evaluateP184Eligibility({
      row: baseRow(),
      onboarding: null,
      job: { ...publishedJob(), status: "closed" },
      config: DEFAULT_P184_CONFIG,
      queueItems: [],
      completedIdempotencyKeys: new Set(),
    });
    assert.ok(inactiveJob.gates.some((g) => g.id === "job_active" && !g.passed));
  });

  it("enforces duplicate protection and idempotency keys", () => {
    const key = buildP184IdempotencyKey({
      candidateId: "cand-1",
      templateKey: "onboarding_packet",
      positionId: "job-1",
    });
    const withSentAt = evaluateP184Eligibility({
      row: baseRow({ paperworkSentAt: "2026-07-01T00:00:00.000Z", paperworkStatus: "not_sent" }),
      onboarding: null,
      job: publishedJob(),
      config: DEFAULT_P184_CONFIG,
      queueItems: [],
      completedIdempotencyKeys: new Set(),
    });
    assert.equal(withSentAt.eligible, false);

    const withIdempotency = evaluateP184Eligibility({
      row: baseRow(),
      onboarding: null,
      job: publishedJob(),
      config: DEFAULT_P184_CONFIG,
      queueItems: [],
      completedIdempotencyKeys: new Set([key]),
    });
    assert.equal(withIdempotency.eligible, false);

    const queued: P184QueueItem[] = [
      {
        candidateId: "cand-1",
        candidateName: "Ada",
        candidateEmail: "ada@example.com",
        positionId: "job-1",
        jobName: "Merchandiser",
        templateKey: "onboarding_packet",
        idempotencyKey: key,
        status: "queued",
        priority: { agingScore: 1, demandScore: 0, applicationAgeMs: 1, executivePriority: 0, composite: 1 },
        enqueuedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        retryCount: 0,
        nextAttemptAt: null,
        lastError: null,
        permanentFailure: false,
        envelopeId: null,
        sentAt: null,
        durationMs: null,
      },
    ];
    const withQueue = evaluateP184Eligibility({
      row: baseRow(),
      onboarding: null,
      job: publishedJob(),
      config: DEFAULT_P184_CONFIG,
      queueItems: queued,
      completedIdempotencyKeys: new Set(),
    });
    assert.equal(withQueue.eligible, false);
  });

  it("classifies permanent vs transient failures", () => {
    assert.equal(isPermanentSendFailure("Invalid email address"), true);
    assert.equal(isPermanentSendFailure("Template missing"), true);
    assert.equal(isPermanentSendFailure("Job closed"), true);
    assert.equal(isPermanentSendFailure("Candidate withdrawn"), true);
    assert.equal(isPermanentSendFailure("429 rate limit"), false);
  });

  it("orders queue by aging, demand, application age, executive priority", () => {
    const config = {
      ...DEFAULT_P184_CONFIG,
      highDemandPositionIds: ["job-hot"],
      executivePriorityJobIds: ["job-exec"],
    };
    const older = baseRow({
      candidateId: "older",
      appliedDate: "2026-01-01T00:00:00.000Z",
      positionId: "job-1",
    });
    const hot = baseRow({
      candidateId: "hot",
      appliedDate: "2026-06-01T00:00:00.000Z",
      positionId: "job-hot",
    });
    const exec = baseRow({
      candidateId: "exec",
      appliedDate: "2026-06-15T00:00:00.000Z",
      positionId: "job-exec",
    });
    const items: P184QueueItem[] = [older, hot, exec].map((row) => ({
      candidateId: row.candidateId,
      candidateName: row.candidateId,
      candidateEmail: row.email,
      positionId: row.positionId,
      jobName: null,
      templateKey: "onboarding_packet" as const,
      idempotencyKey: buildP184IdempotencyKey({
        candidateId: row.candidateId,
        templateKey: "onboarding_packet",
        positionId: row.positionId,
      }),
      status: "queued" as const,
      priority: computeP184Priority({ row, config, nowMs: Date.parse("2026-07-01T00:00:00.000Z") }),
      enqueuedAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      retryCount: 0,
      nextAttemptAt: null,
      lastError: null,
      permanentFailure: false,
      envelopeId: null,
      sentAt: null,
      durationMs: null,
    }));

    const ordered = sortP184Queue(items).map((i) => i.candidateId);
    assert.equal(ordered[0], "older");
  });

  it("enforces rate limits", () => {
    const now = Date.parse("2026-07-01T12:00:00.000Z");
    const status = evaluateP184RateLimit({
      config: { maxPerMinute: 1, maxPerHour: 10, maxPerDay: 100, concurrentSends: 1 },
      sendTimestamps: [new Date(now - 10_000).toISOString()],
      inFlight: 0,
      nowMs: now,
    });
    assert.equal(status.limited, true);
    assert.ok(status.limitedBy.includes("minute"));
    assert.equal(canAcquireSendSlot(status), false);
  });

  it("dry run validates and simulates sends without Dropbox", async () => {
    const state = await loadP184EngineState();
    state.config = { ...state.config, enabled: true, mode: "dry_run" };
    await saveP184EngineState(state);

    let dropboxCalled = false;
    const result = await runP184AutonomousPaperworkSendEngine({
      candidates: [baseRow()],
      onboardingByCandidateId: new Map(),
      jobsByPositionId: new Map([["job-1", publishedJob()]]),
      mode: "dry_run",
      deps: {
        executeOnboardingSend: async () => {
          dropboxCalled = true;
          return { ok: false, error: "should not call", httpStatus: 500, transient: true };
        },
      },
    });

    assert.equal(dropboxCalled, false);
    assert.equal(result.mode, "dry_run");
    assert.equal(result.eligible, 1);
    assert.equal(result.sent, 1);
    assert.equal(result.results[0]?.simulated, true);
    assert.equal(result.report.eligible.length, 1);
  });

  it("live mode sends via Dropbox adapter and writes audit", async () => {
    const state = await loadP184EngineState();
    state.config = { ...state.config, enabled: true, mode: "live" };
    await saveP184EngineState(state);

    const onboarding = {
      onboardingId: "ob-1",
      candidateId: "cand-1",
      status: "queued",
      paperworkComplete: false,
      readyForMel: false,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      escalated: false,
      statusHistory: [],
    } as CandidateOnboardingRecord;

    const result = await runP184AutonomousPaperworkSendEngine({
      candidates: [baseRow()],
      onboardingByCandidateId: new Map(),
      jobsByPositionId: new Map([["job-1", publishedJob()]]),
      mode: "live",
      deps: {
        prepareOnboardingSend: async () => onboarding,
        executeOnboardingSend: async () => ({
          ok: true,
          signatureRequestId: "env-123",
          signingStatus: "pending",
          paperworkStatus: "sent",
          workflow: {} as never,
        }),
      },
    });

    assert.equal(result.sent, 1);
    assert.equal(result.results[0]?.envelopeId, "env-123");
    assert.equal(result.results[0]?.simulated, false);

    const events = await listP184AuditEvents();
    assert.ok(events.some((e) => e.status === "sent" && e.envelopeId === "env-123"));

    const persisted = await loadP184EngineState();
    assert.ok(persisted.completedIdempotencyKeys.length >= 1);
    assert.ok(persisted.queue.some((q) => q.status === "sent"));
  });

  it("schedules retries for transient failures with backoff", async () => {
    const state = await loadP184EngineState();
    state.config = { ...state.config, enabled: true, mode: "live", maxRetries: 3 };
    await saveP184EngineState(state);

    const result = await runP184AutonomousPaperworkSendEngine({
      candidates: [baseRow()],
      onboardingByCandidateId: new Map(),
      jobsByPositionId: new Map([["job-1", publishedJob()]]),
      mode: "live",
      deps: {
        prepareOnboardingSend: async () =>
          ({
            onboardingId: "ob-1",
            candidateId: "cand-1",
            status: "queued",
            paperworkComplete: false,
            readyForMel: false,
            createdAt: new Date().toISOString(),
            retryCount: 0,
            escalated: false,
            statusHistory: [],
          }) as CandidateOnboardingRecord,
        executeOnboardingSend: async () => ({
          ok: false,
          error: "429 Too Many Requests",
          httpStatus: 429,
          transient: true,
        }),
      },
    });

    assert.equal(result.failed, 1);
    assert.equal(result.retriesScheduled, 1);
    const persisted = await loadP184EngineState();
    const item = persisted.queue.find((q) => q.candidateId === "cand-1");
    assert.equal(item?.status, "failed_transient");
    assert.equal(item?.retryCount, 1);
    assert.ok(item?.nextAttemptAt);
  });

  it("survives restart by reloading queue from disk", async () => {
    const state = await loadP184EngineState();
    state.queue = [
      {
        candidateId: "cand-persist",
        candidateName: "Persist",
        candidateEmail: "p@example.com",
        positionId: "job-1",
        jobName: "Merchandiser",
        templateKey: "onboarding_packet",
        idempotencyKey: "p184:cand-persist:onboarding_packet:job-1",
        status: "queued",
        priority: { agingScore: 5, demandScore: 0, applicationAgeMs: 1, executivePriority: 0, composite: 10 },
        enqueuedAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        retryCount: 0,
        nextAttemptAt: "2026-07-01T00:00:00.000Z",
        lastError: null,
        permanentFailure: false,
        envelopeId: null,
        sentAt: null,
        durationMs: null,
      },
    ];
    await saveP184EngineState(state);
    resetP184StateMemoryForTests();
    const reloaded = await loadP184EngineState();
    assert.equal(reloaded.queue.length, 1);
    assert.equal(reloaded.queue[0]?.candidateId, "cand-persist");
  });
});
