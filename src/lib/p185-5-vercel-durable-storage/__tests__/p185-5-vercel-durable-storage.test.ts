import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  acquireLease,
  applyP1855Migrations,
  claimQueueItem,
  createSqlClient,
  putDocument,
  getDocument,
  resetSqlClientCacheForTests,
  runP1855DurabilityValidation,
  validationPassed,
  migrateFrozenRolloutToDurableStore,
} from "@/lib/p185-5-vercel-durable-storage";
import { writeFile, mkdir } from "node:fs/promises";

describe("P185.5 vercel durable storage", () => {
  let dataDir: string;
  let pgliteDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), "p1855-src-"));
    pgliteDir = await mkdtemp(path.join(os.tmpdir(), "p1855-pg-"));
    process.env.P185_PGLITE_DATA_DIR = pgliteDir;
    process.env.P185_5_FORCE_PGLITE = "1";
    delete process.env.P185_DATABASE_URL;
    delete process.env.DATABASE_URL;
    delete process.env.P185_PRODUCTION_STORAGE_CONFIRMED;
    await resetSqlClientCacheForTests();
  });

  afterEach(async () => {
    await resetSqlClientCacheForTests();
    delete process.env.P185_PGLITE_DATA_DIR;
    delete process.env.P185_5_FORCE_PGLITE;
    await rm(dataDir, { recursive: true, force: true });
    await rm(pgliteDir, { recursive: true, force: true });
  });

  it("applies schema migrations", async () => {
    const client = await createSqlClient({ forceNew: true, forcePglite: true, pgliteDataDir: pgliteDir });
    const result = await applyP1855Migrations(client);
    assert.equal(result.applied, true);
    assert.equal(result.schemaVersion, 1);
    const again = await applyP1855Migrations(client);
    assert.equal(again.alreadyApplied, true);
  });

  it("supports document CAS and restart persistence", async () => {
    const client = await createSqlClient({ forceNew: true, forcePglite: true, pgliteDataDir: pgliteDir });
    await applyP1855Migrations(client);
    await putDocument("test:doc", { a: 1 }, client);
    await resetSqlClientCacheForTests();
    const client2 = await createSqlClient({ forceNew: true, forcePglite: true, pgliteDataDir: pgliteDir });
    const doc = await getDocument("test:doc", client2);
    assert.equal((doc?.value as { a: number }).a, 1);
  });

  it("prevents two workers from claiming the same queue item", async () => {
    const client = await createSqlClient({ forceNew: true, forcePglite: true, pgliteDataDir: pgliteDir });
    await applyP1855Migrations(client);
    await client.query(
      `INSERT INTO p184_queue_items (
         candidate_id, idempotency_key, status, payload, priority_composite, enqueued_at, updated_at
       ) VALUES ('c1','idem-c1','queued','{}'::jsonb,1,NOW(),NOW())`,
    );
    const a = await claimQueueItem({ candidateId: "c1", claimantId: "a", client });
    const b = await claimQueueItem({ candidateId: "c1", claimantId: "b", client });
    assert.equal(a.claimed, true);
    assert.equal(b.claimed, false);
  });

  it("supports lease acquire, contention, and stale takeover", async () => {
    const client = await createSqlClient({ forceNew: true, forcePglite: true, pgliteDataDir: pgliteDir });
    await applyP1855Migrations(client);
    const first = await acquireLease({
      leaseKey: "t",
      ownerId: "o1",
      cycleId: "c1",
      ttlMs: 60_000,
      client,
    });
    const second = await acquireLease({
      leaseKey: "t",
      ownerId: "o2",
      cycleId: "c2",
      ttlMs: 60_000,
      client,
    });
    assert.equal(first.acquired, true);
    assert.equal(second.acquired, false);
    await client.query(`UPDATE p185_leases SET expires_at = NOW() - INTERVAL '1 second' WHERE lease_key = 't'`);
    const third = await acquireLease({
      leaseKey: "t",
      ownerId: "o3",
      cycleId: "c3",
      ttlMs: 60_000,
      client,
    });
    assert.equal(third.acquired, true);
  });

  it("runs full durability validation suite", async () => {
    const client = await createSqlClient({ forceNew: true, forcePglite: true, pgliteDataDir: pgliteDir });
    const report = await runP1855DurabilityValidation({ client });
    assert.equal(validationPassed(report), true, report.details.join(" | "));
  });

  it("migrates frozen cohort and queue from filesystem JSON", async () => {
    await mkdir(dataDir, { recursive: true });
    const members = Array.from({ length: 25 }, (_, i) => ({
      candidateId: `cand-${i + 1}`,
      resolvedPositionId: "pos-1",
      normalizedWorkflowStatus: "Paperwork Needed",
      evidenceRefs: ["p97"],
      templateKey: "onboarding_packet",
      emailHash: `hash-${i + 1}`,
      idempotencyKey: `idem-${i + 1}`,
      queueTimestamp: `2026-07-10T11:00:${String(i).padStart(2, "0")}.000Z`,
      cohortId: "cohort-test",
      approvalTimestamp: "2026-07-10T10:00:00.000Z",
      blockedReason: null,
      removed: false,
    }));
    const queue = members.map((m, i) => ({
      candidateId: m.candidateId,
      candidateName: `Candidate ${i + 1}`,
      candidateEmail: `c${i + 1}@example.com`,
      positionId: "pos-1",
      jobName: null,
      templateKey: "onboarding_packet",
      idempotencyKey: m.idempotencyKey,
      status: "queued",
      priority: {
        agingScore: 0,
        demandScore: 0,
        applicationAgeMs: 0,
        executivePriority: 0,
        composite: 25 - i,
      },
      enqueuedAt: m.queueTimestamp,
      updatedAt: m.queueTimestamp,
      retryCount: 0,
      nextAttemptAt: m.queueTimestamp,
      lastError: null,
      permanentFailure: false,
      envelopeId: null,
      sentAt: null,
      durationMs: null,
    }));
    await writeFile(
      path.join(dataDir, "p184-autonomous-paperwork-send-state.json"),
      JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        config: {
          enabled: true,
          mode: "dry_run",
          maxSendsPerCycle: 10,
          maxRetries: 3,
          rateLimits: { maxPerMinute: 4, maxPerHour: 40, maxPerDay: 200, concurrentSends: 2 },
          updatedAt: new Date().toISOString(),
        },
        queue,
        sendTimestamps: [],
        completedIdempotencyKeys: [],
      }),
      "utf8",
    );
    await writeFile(
      path.join(dataDir, "p185-3-controlled-live-paperwork-rollout-state.json"),
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        phase: "awaiting_configuration",
        cohort: {
          rolloutId: "p1853-20260710-b419512d",
          cohortId: "cohort-test",
          frozenAt: "2026-07-10T12:00:00.000Z",
          approvedCount: 25,
          members,
          immutable: true,
        },
        canary: {
          maxSends: 5,
          concurrent: 1,
          attempted: 0,
          confirmed: 0,
          failed: 0,
          sentUnverified: 0,
          passed: false,
          paused: false,
          attempts: [],
        },
        backlog: { cycle: 0, attempted: 0, confirmed: 0, failed: 0, sentUnverified: 0, remaining: 25 },
        totals: {
          packetsSent: 0,
          packetsConfirmed: 0,
          sentUnverified: 0,
          failed: 0,
          duplicatesPrevented: 0,
          newlyBlocked: 0,
        },
        lastDryRun: null,
        killSwitch: false,
        circuitOpen: false,
        nextScheduledAction: null,
      }),
      "utf8",
    );

    const client = await createSqlClient({ forceNew: true, forcePglite: true, pgliteDataDir: pgliteDir });
    const report = await migrateFrozenRolloutToDurableStore({
      client,
      dataDir,
      expectedRolloutId: "p1853-20260710-b419512d",
    });
    assert.equal(report.ok, true, report.errors.join("; "));
    assert.equal(report.before.frozenCohort, 25);
    assert.equal(report.after.frozenCohort, 25);
    assert.equal(report.before.queueDepth, 25);
    assert.equal(report.after.queueDepth, 25);
  });
});
