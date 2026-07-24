import {
  acquireLease,
  claimQueueItem,
  compareAndSetDocument,
  createIdempotencyKeyDurable,
  getDocument,
  heartbeatLease,
  markIdempotencyCompleted,
  putDocument,
  releaseLease,
  upsertEnvelopeRecord,
  DOC_KEYS,
} from "@/lib/p185-5-vercel-durable-storage/adapter";
import { applyP1855Migrations } from "@/lib/p185-5-vercel-durable-storage/migrate";
import { createSqlClient, resetSqlClientCacheForTests } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import type { P1855ValidationReport, SqlClient } from "@/lib/p185-5-vercel-durable-storage/types";

/**
 * Durability validation suite against the active SQL backend.
 * Uses synthetic keys — does not send paperwork.
 * Cleans up synthetic rows so production queue/cohort counts stay intact.
 */
export async function runP1855DurabilityValidation(input?: {
  client?: SqlClient;
}): Promise<P1855ValidationReport> {
  const details: string[] = [];
  const db = input?.client ?? (await createSqlClient());
  await applyP1855Migrations(db);

  // --- restart test: put → close cache → reload ---
  const restartKey = "p1855:validation:restart";
  await putDocument(restartKey, { marker: "alive", n: 1 }, db);
  await resetSqlClientCacheForTests();
  const db2 = await createSqlClient({ forceNew: true });
  await applyP1855Migrations(db2);
  const reloaded = await getDocument(restartKey, db2);
  const restartTest = reloaded?.value != null && (reloaded.value as { marker?: string }).marker === "alive";
  details.push(restartTest ? "Restart persistence OK." : "Restart persistence FAILED.");

  // --- concurrency: two claims on same candidate ---
  const candidateId = "p1855-concurrency-cand";
  const idem = `idem-${candidateId}`;
  await db2.query(`DELETE FROM p184_queue_items WHERE candidate_id = $1`, [candidateId]);
  await db2.query(`DELETE FROM p184_idempotency_keys WHERE candidate_id = $1`, [candidateId]);
  await db2.query(
    `INSERT INTO p184_queue_items (
       candidate_id, idempotency_key, status, payload, priority_composite, enqueued_at, updated_at
     ) VALUES ($1,$2,'queued','{}'::jsonb,1,NOW(),NOW())`,
    [candidateId, idem],
  );
  const claimA = await claimQueueItem({ candidateId, claimantId: "worker-a", client: db2 });
  const claimB = await claimQueueItem({ candidateId, claimantId: "worker-b", client: db2 });
  const concurrencyTest = claimA.claimed === true && claimB.claimed === false;
  details.push(
    concurrencyTest
      ? "Two-instance claim exclusivity OK."
      : `Concurrency FAILED a=${claimA.claimed} b=${claimB.claimed}.`,
  );

  // --- lease contention + stale takeover ---
  await db2.query(`DELETE FROM p185_leases WHERE lease_key = 'p185:validation'`);
  const lease1 = await acquireLease({
    leaseKey: "p185:validation",
    ownerId: "owner-1",
    cycleId: "cycle-1",
    ttlMs: 60_000,
    client: db2,
  });
  const lease2 = await acquireLease({
    leaseKey: "p185:validation",
    ownerId: "owner-2",
    cycleId: "cycle-2",
    ttlMs: 60_000,
    client: db2,
  });
  const leaseContention = lease1.acquired && !lease2.acquired;
  // Force stale
  await db2.query(
    `UPDATE p185_leases SET expires_at = NOW() - INTERVAL '1 second' WHERE lease_key = 'p185:validation'`,
  );
  const lease3 = await acquireLease({
    leaseKey: "p185:validation",
    ownerId: "owner-3",
    cycleId: "cycle-3",
    ttlMs: 60_000,
    client: db2,
  });
  const staleLeaseTakeover = lease3.acquired === true;
  details.push(
    leaseContention && staleLeaseTakeover
      ? "Lease contention + stale takeover OK."
      : "Lease tests FAILED.",
  );
  if (lease3.acquired) {
    await releaseLease({
      leaseKey: "p185:validation",
      ownerId: "owner-3",
      cycleId: "cycle-3",
      client: db2,
    });
  }

  // --- idempotency survives restart ---
  const idemKey = "p1855-idem-restart-key";
  await createIdempotencyKeyDurable({ idempotencyKey: idemKey, candidateId: "idem-cand", client: db2 });
  await markIdempotencyCompleted(idemKey, db2);
  await resetSqlClientCacheForTests();
  const db3 = await createSqlClient({ forceNew: true });
  const idemRow = await db3.query(
    `SELECT completed FROM p184_idempotency_keys WHERE idempotency_key = $1`,
    [idemKey],
  );
  const idempotencySurvivesRestart = idemRow.rows[0]?.completed === true;
  details.push(
    idempotencySurvivesRestart ? "Idempotency survives restart OK." : "Idempotency restart FAILED.",
  );

  // --- sent_unverified cannot be resent ---
  const suCand = "p1855-sent-unverified-cand";
  await db3.query(`DELETE FROM p185_envelopes WHERE candidate_id = $1`, [suCand]);
  await db3.query(`DELETE FROM p184_queue_items WHERE candidate_id = $1`, [suCand]);
  await db3.query(`DELETE FROM p184_idempotency_keys WHERE candidate_id = $1`, [suCand]);
  await upsertEnvelopeRecord({
    envelopeId: "env-su-1",
    candidateId: suCand,
    idempotencyKey: `idem-${suCand}`,
    state: "sent_unverified",
    client: db3,
  });
  await db3.query(
    `INSERT INTO p184_queue_items (
       candidate_id, idempotency_key, status, payload, priority_composite, enqueued_at, updated_at
     ) VALUES ($1,$2,'queued','{}'::jsonb,1,NOW(),NOW())`,
    [suCand, `idem-${suCand}`],
  );
  const suClaim = await claimQueueItem({ candidateId: suCand, claimantId: "worker-su", client: db3 });
  const sentUnverifiedNoResend = suClaim.claimed === false;
  details.push(
    sentUnverifiedNoResend
      ? "sent_unverified blocks resend OK."
      : "sent_unverified resend protection FAILED.",
  );

  // --- queue ordering preserved ---
  await db3.query(`DELETE FROM p184_queue_items WHERE candidate_id LIKE 'p1855-order-%'`);
  for (let i = 0; i < 5; i++) {
    await db3.query(
      `INSERT INTO p184_queue_items (
         candidate_id, idempotency_key, status, payload, priority_composite, enqueued_at, updated_at
       ) VALUES ($1,$2,'queued','{}'::jsonb,$3,$4::timestamptz,NOW())`,
      [
        `p1855-order-${i}`,
        `idem-order-${i}`,
        10 - i,
        new Date(Date.UTC(2026, 6, 10, 12, 0, i)).toISOString(),
      ],
    );
  }
  const ordered = await db3.query(
    `SELECT candidate_id FROM p184_queue_items
     WHERE candidate_id LIKE 'p1855-order-%'
     ORDER BY priority_composite DESC, enqueued_at ASC`,
  );
  const orderIds = ordered.rows.map((r) => String(r.candidate_id));
  const queueOrderingPreserved = orderIds[0] === "p1855-order-0" && orderIds[4] === "p1855-order-4";
  details.push(queueOrderingPreserved ? "Queue ordering OK." : `Queue ordering FAILED: ${orderIds.join(",")}`);

  // --- rate-limit counters persist via document CAS ---
  const rlKey = DOC_KEYS.p184State + ":ratelimit-test";
  const first = await putDocument(rlKey, { sendTimestamps: ["2026-07-10T12:00:00.000Z"] }, db3);
  const cas = await compareAndSetDocument(
    rlKey,
    first.version,
    { sendTimestamps: ["2026-07-10T12:00:00.000Z", "2026-07-10T12:01:00.000Z"] },
    db3,
  );
  await resetSqlClientCacheForTests();
  const db4 = await createSqlClient({ forceNew: true });
  const rlDoc = await getDocument(rlKey, db4);
  const rateLimitCountersPersist =
    cas != null &&
    Array.isArray((rlDoc?.value as { sendTimestamps?: string[] })?.sendTimestamps) &&
    ((rlDoc?.value as { sendTimestamps: string[] }).sendTimestamps.length === 2);
  details.push(
    rateLimitCountersPersist ? "Rate-limit counter persistence OK." : "Rate-limit persistence FAILED.",
  );

  // heartbeat smoke
  const hbLease = await acquireLease({
    leaseKey: "p185:validation-hb",
    ownerId: "hb",
    cycleId: "hb1",
    ttlMs: 30_000,
    client: db4,
  });
  if (hbLease.acquired) {
    await heartbeatLease({
      leaseKey: "p185:validation-hb",
      ownerId: "hb",
      cycleId: "hb1",
      ttlMs: 30_000,
      client: db4,
    });
    await releaseLease({
      leaseKey: "p185:validation-hb",
      ownerId: "hb",
      cycleId: "hb1",
      client: db4,
    });
  }

  // Remove synthetic validation rows so health queue counts stay accurate.
  await db4.query(
    `DELETE FROM p184_queue_items WHERE candidate_id LIKE 'p1855-%' OR candidate_id = 'idem-cand'`,
  );
  await db4.query(
    `DELETE FROM p184_idempotency_keys
     WHERE candidate_id LIKE 'p1855-%'
        OR candidate_id = 'idem-cand'
        OR idempotency_key LIKE 'p1855-%'
        OR idempotency_key LIKE 'idem-order-%'
        OR idempotency_key = 'p1855-idem-restart-key'`,
  );
  await db4.query(`DELETE FROM p185_envelopes WHERE candidate_id LIKE 'p1855-%'`);
  await db4.query(`DELETE FROM p185_leases WHERE lease_key LIKE 'p185:validation%'`);
  await db4.query(`DELETE FROM p1855_documents WHERE doc_key LIKE 'p1855:validation%' OR doc_key LIKE '%:ratelimit-test'`);

  return {
    restartTest,
    concurrencyTest,
    staleLeaseTakeover: leaseContention && staleLeaseTakeover,
    idempotencySurvivesRestart,
    sentUnverifiedNoResend,
    queueOrderingPreserved,
    rateLimitCountersPersist,
    details,
  };
}

export function validationPassed(report: P1855ValidationReport): boolean {
  return (
    report.restartTest &&
    report.concurrencyTest &&
    report.staleLeaseTakeover &&
    report.idempotencySurvivesRestart &&
    report.sentUnverifiedNoResend &&
    report.queueOrderingPreserved &&
    report.rateLimitCountersPersist
  );
}
