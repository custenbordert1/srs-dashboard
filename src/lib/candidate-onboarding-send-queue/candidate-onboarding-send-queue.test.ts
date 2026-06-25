import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import {
  getOnboardingRecordById,
  listAllCandidateOnboardingRecords,
  recordCandidateOnboarding,
} from "@/lib/candidate-onboarding-engine/onboarding-record-store";
import { DropboxSignError } from "@/lib/dropbox-sign";
import type { SendTemplateSignatureRequestInput } from "@/lib/dropbox-sign";
import {
  duplicatePaperworkSendBlockReason,
} from "@/lib/onboarding-send-packet-sync";
import {
  enqueuePendingApprovalOnboardingRecords,
  loadOnboardingSendQueueWorkerState,
  processOnboardingSendQueue,
  reclaimStaleSendingRecords,
  saveOnboardingSendQueueConfig,
  saveOnboardingSendQueueWorkerState,
  startOnboardingSendQueue,
} from "@/lib/candidate-onboarding-send-queue";
import { listOnboardingSendAttemptLogs } from "@/lib/candidate-onboarding-send-queue/send-queue-state-store";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import {
  installIsolatedRecruitingDataDir,
  type IsolatedRecruitingDataHandle,
} from "@/lib/test/recruiting-test-isolation";

let isolation: IsolatedRecruitingDataHandle;

function pendingRecord(candidateId: string, onboardingId: string): CandidateOnboardingRecord {
  return {
    onboardingId,
    candidateId,
    status: "pending_approval",
    paperworkComplete: false,
    readyForMel: false,
    createdAt: "2026-06-20T12:00:00.000Z",
    retryCount: 0,
    escalated: false,
    statusHistory: [{ at: "2026-06-20T12:00:00.000Z", status: "pending_approval" }],
  };
}

async function resetQueueStores() {
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(
    path.join(recruitingDataDir(), "candidate-onboarding-records.json"),
    `${JSON.stringify({ records: [], updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(recruitingDataDir(), "candidate-onboarding-send-queue-state.json"),
    `${JSON.stringify(
      {
        worker: {
          running: false,
          lastTickAt: null,
          lastSendCompletedAt: null,
          lastBatchCompletedAt: null,
          sendsCompletedThisSession: 0,
          lastError: null,
          updatedAt: new Date().toISOString(),
        },
        attemptLogs: [],
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(recruitingDataDir(), "candidate-workflows.json"),
    `${JSON.stringify({ workflows: {}, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
}

async function seedIngestion(candidates: Record<string, { name: string; email: string }>) {
  const payload = {
    version: 1,
    runId: null,
    publishedPositionIds: [],
    publishedPositionsTotal: 0,
    scannedPositionIds: [],
    checkpointIndex: 0,
    candidates: Object.fromEntries(
      Object.entries(candidates).map(([candidateId, row]) => [
        candidateId,
        {
          candidateId,
          name: row.name,
          email: row.email,
          positionId: "pos-1",
          stage: "offer",
        },
      ]),
    ),
    lastJobListAt: null,
    lastChunkAt: null,
    lastFullCycleAt: null,
    cycleComplete: false,
    chunksThisRun: 0,
    updatedAt: new Date().toISOString(),
  };
  await mkdir(recruitingDataDir(), { recursive: true });
  await writeFile(
    path.join(recruitingDataDir(), "candidate-ingestion.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
}

async function seedPendingRecords(count: number, prefix = "c"): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    const candidateId = `${prefix}-${String(i).padStart(4, "0")}`;
    await recordCandidateOnboarding(pendingRecord(candidateId, `onb-${candidateId}`));
  }
  const emails: Record<string, { name: string; email: string }> = {};
  for (let i = 0; i < count; i += 1) {
    const candidateId = `${prefix}-${String(i).padStart(4, "0")}`;
    emails[candidateId] = { name: `Candidate ${i}`, email: `${candidateId}@example.com` };
  }
  await seedIngestion(emails);
}

async function useFastQueueConfig(overrides?: { batchSize?: number; maxRetries?: number }) {
  await saveOnboardingSendQueueConfig({
    maxConcurrentSends: 1,
    batchSize: overrides?.batchSize ?? 50,
    delayBetweenSendsMs: 0,
    delayBetweenBatchesMs: 0,
    maxRetries: overrides?.maxRetries ?? 3,
    retryBackoffBaseMs: 30_000,
    sendingStaleMs: 1_000,
    defaultTemplateKey: "onboarding_packet",
    updatedAt: new Date().toISOString(),
  });
}

function testSendDeps(
  send: (req: SendTemplateSignatureRequestInput) => Promise<{
    signatureRequestId: string;
    isComplete: boolean;
    isDeclined: boolean;
    signatures: [];
    rawStatus: string;
  }>,
) {
  return {
    sendTemplateSignatureRequest: send,
    resolveTemplateId: () => "template-test",
  };
}

function mockSendFactory(input?: {
  failCandidateIds?: Set<string>;
  rateLimitOnceFor?: Set<string>;
  failCountByCandidate?: Map<string, number>;
}) {
  const sent = new Set<string>();
  const failCounts = new Map(input?.failCountByCandidate ?? []);
  const rateLimitRemaining = new Map<string, number>();
  for (const id of input?.rateLimitOnceFor ?? []) rateLimitRemaining.set(id, 1);

  return async (req: SendTemplateSignatureRequestInput) => {
    const email = req.signers[0]?.emailAddress ?? "";
    const candidateId = email.split("@")[0] ?? "unknown";
    if (input?.failCandidateIds?.has(candidateId)) {
      throw new DropboxSignError("Invalid email address", "validation_error", 400);
    }
    const configuredFails = failCounts.get(candidateId) ?? 0;
    if (configuredFails > 0) {
      failCounts.set(candidateId, configuredFails - 1);
      throw new DropboxSignError("Too many requests", "api_error", 429);
    }
    if ((rateLimitRemaining.get(candidateId) ?? 0) > 0) {
      rateLimitRemaining.set(candidateId, 0);
      throw new DropboxSignError("Too many requests", "api_error", 429);
    }
    if (sent.has(candidateId)) {
      throw new DropboxSignError("Duplicate send blocked in test", "validation_error", 409);
    }
    sent.add(candidateId);
    return {
      signatureRequestId: `sig-${candidateId}`,
      isComplete: false,
      isDeclined: false,
      signatures: [],
      rawStatus: "awaiting_signature",
    };
  };
}

before(async () => {
  isolation = await installIsolatedRecruitingDataDir("onboarding-send-queue-");
});

beforeEach(async () => {
  process.env.SRS_RECRUITING_DATA_DIR = isolation.dir;
  process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR = isolation.dir;
  await resetQueueStores();
});

after(async () => {
  delete process.env.SRS_RECRUITING_DATA_DIR;
  delete process.env.SRS_CANDIDATE_WORKFLOW_DATA_DIR;
  await isolation.restore();
});

describe("candidate-onboarding-send-queue", () => {
  it("enqueues and sends a large pending_approval queue", async () => {
    await seedPendingRecords(155);
    await useFastQueueConfig({ batchSize: 200 });
    await startOnboardingSendQueue();

    let totalSent = 0;
    for (let tick = 0; tick < 5 && totalSent < 155; tick += 1) {
      const result = await processOnboardingSendQueue({
        force: true,
        sleep: async () => {},
        sendDeps: testSendDeps(mockSendFactory()),
        byUserId: "test-user",
      });
      totalSent += result.sent;
    }

    const records = await listAllCandidateOnboardingRecords();
    const sentCount = records.filter((row) => row.status === "sent").length;
    assert.equal(sentCount, 155);
    assert.equal(totalSent, 155);
  });

  it("recovers from rate limits with automatic retry", async () => {
    await recordCandidateOnboarding(pendingRecord("rate-1", "onb-rate-1"));
    await seedIngestion({ "rate-1": { name: "Rate Limit", email: "rate-1@example.com" } });
    await useFastQueueConfig({ batchSize: 1, maxRetries: 3 });

    let nowMs = Date.parse("2026-06-25T10:00:00.000Z");
    const send = mockSendFactory({ rateLimitOnceFor: new Set(["rate-1"]) });

    await startOnboardingSendQueue();
    const first = await processOnboardingSendQueue({
      force: true,
      now: () => nowMs,
      sleep: async () => {},
      sendDeps: testSendDeps(send),
    });
    assert.equal(first.retryScheduled, 1);

    const scheduled = await getOnboardingRecordById("onb-rate-1");
    assert.equal(scheduled?.status, "retry_scheduled");
    assert.ok(scheduled?.nextRetryAt);

    nowMs = Date.parse(scheduled!.nextRetryAt!) + 1;
    const second = await processOnboardingSendQueue({
      force: true,
      now: () => nowMs,
      sleep: async () => {},
      sendDeps: testSendDeps(send),
    });
    assert.equal(second.sent, 1);

    const done = await getOnboardingRecordById("onb-rate-1");
    assert.equal(done?.status, "sent");
    assert.ok(done?.signatureRequestId);
  });

  it("resumes after interruption by reclaiming stale sending records", async () => {
    await recordCandidateOnboarding({
      ...pendingRecord("resume-1", "onb-resume-1"),
      status: "sending",
      lastSendAttemptAt: "2026-06-25T09:00:00.000Z",
    });
    await seedIngestion({ "resume-1": { name: "Resume", email: "resume-1@example.com" } });
    await useFastQueueConfig();

    const reclaimed = await reclaimStaleSendingRecords({
      staleMs: 1_000,
      now: Date.parse("2026-06-25T10:00:00.000Z"),
    });
    assert.equal(reclaimed, 1);

    const reclaimedRecord = await getOnboardingRecordById("onb-resume-1");
    assert.equal(reclaimedRecord?.status, "queued");

    await saveOnboardingSendQueueWorkerState({
      ...(await loadOnboardingSendQueueWorkerState()),
      running: true,
      updatedAt: new Date().toISOString(),
    });

    const result = await processOnboardingSendQueue({
      force: true,
      sleep: async () => {},
      sendDeps: testSendDeps(mockSendFactory()),
    });
    assert.equal(result.sent, 1);
  });

  it("never resends already-sent onboarding records", async () => {
    await recordCandidateOnboarding({
      ...pendingRecord("dup-1", "onb-dup-1"),
      status: "sent",
      signatureRequestId: "sig-existing",
      sentAt: "2026-06-25T08:00:00.000Z",
    });
    await recordCandidateOnboarding(pendingRecord("dup-2", "onb-dup-2"));
    await seedIngestion({
      "dup-1": { name: "Already Sent", email: "dup-1@example.com" },
      "dup-2": { name: "Pending", email: "dup-2@example.com" },
    });
    await useFastQueueConfig();

    const enqueued = await enqueuePendingApprovalOnboardingRecords();
    assert.equal(enqueued.enqueued, 1);

    const reason = duplicatePaperworkSendBlockReason({
      workflow: null,
      activeOnboarding: await getOnboardingRecordById("onb-dup-1"),
    });
    assert.ok(reason);

    const result = await processOnboardingSendQueue({
      force: true,
      sleep: async () => {},
      sendDeps: testSendDeps(mockSendFactory()),
    });
    assert.equal(result.sent, 1);
    const sent = await getOnboardingRecordById("onb-dup-1");
    assert.equal(sent?.signatureRequestId, "sig-existing");
  });

  it("records partial failures without stopping the queue", async () => {
    await recordCandidateOnboarding(pendingRecord("ok-1", "onb-ok-1"));
    await recordCandidateOnboarding(pendingRecord("bad-1", "onb-bad-1"));
    await seedIngestion({
      "ok-1": { name: "OK", email: "ok-1@example.com" },
      "bad-1": { name: "Bad", email: "bad-1@example.com" },
    });
    await useFastQueueConfig({ batchSize: 2 });

    await startOnboardingSendQueue();
    const result = await processOnboardingSendQueue({
      force: true,
      sleep: async () => {},
      sendDeps: testSendDeps(mockSendFactory({ failCandidateIds: new Set(["bad-1"]) })),
    });

    assert.equal(result.sent, 1);
    assert.equal(result.failed, 1);

    const ok = await getOnboardingRecordById("onb-ok-1");
    const bad = await getOnboardingRecordById("onb-bad-1");
    assert.equal(ok?.status, "sent");
    assert.equal(bad?.status, "failed");
  });

  it("logs each send attempt with timing and outcome", async () => {
    await recordCandidateOnboarding(pendingRecord("log-1", "onb-log-1"));
    await seedIngestion({ "log-1": { name: "Log", email: "log-1@example.com" } });
    await useFastQueueConfig();

    await startOnboardingSendQueue();
    await processOnboardingSendQueue({
      force: true,
      sleep: async () => {},
      sendDeps: testSendDeps(mockSendFactory()),
    });

    const logs = await listOnboardingSendAttemptLogs(10);
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.candidateId, "log-1");
    assert.equal(logs[0]?.onboardingId, "onb-log-1");
    assert.equal(logs[0]?.attemptNumber, 1);
    assert.ok(logs[0]?.startedAt);
    assert.ok(logs[0]?.endedAt);
    assert.ok((logs[0]?.durationMs ?? 0) >= 0);
    assert.equal(logs[0]?.outcome, "sent");
  });

  it("marks exhausted retries as failed", async () => {
    await recordCandidateOnboarding(pendingRecord("max-1", "onb-max-1"));
    await seedIngestion({ "max-1": { name: "Max", email: "max-1@example.com" } });
    await useFastQueueConfig({ batchSize: 1, maxRetries: 2 });

    const send = mockSendFactory({
      failCountByCandidate: new Map([["max-1", 3]]),
    });

    await startOnboardingSendQueue();
    let nowMs = Date.parse("2026-06-25T10:00:00.000Z");

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await processOnboardingSendQueue({
        force: true,
        now: () => nowMs,
        sleep: async () => {},
        sendDeps: testSendDeps(send),
      });
      nowMs += 31_000;
    }

    const record = await getOnboardingRecordById("onb-max-1");
    assert.equal(record?.status, "failed");
    assert.ok(record?.failureReason?.includes("Too many requests"));
  });
});
