import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  appendAuditEvent,
  putDocument,
  DOC_KEYS,
  hashEnvelopeId,
} from "@/lib/p185-5-vercel-durable-storage/adapter";
import { applyP1855Migrations } from "@/lib/p185-5-vercel-durable-storage/migrate";
import { createSqlClient, stableHash } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import type {
  MigrationChecksum,
  P1855MigrationReport,
  SqlClient,
} from "@/lib/p185-5-vercel-durable-storage/types";
import { P185_5_SOURCE_PHASE } from "@/lib/p185-5-vercel-durable-storage/types";
import { recruitingDataDir } from "@/lib/recruiting-data-dir";
import type { P184EngineStateFile } from "@/lib/p184-autonomous-paperwork-send-engine/types";
import type { P185RunnerStateFile } from "@/lib/p185-production-paperwork-automation-runner/types";
import type { P1853RolloutStateFile } from "@/lib/p185-3-controlled-live-paperwork-rollout/types";

function checksum(entity: string, source: unknown, dest: unknown, sourceCount: number, destinationCount: number): MigrationChecksum {
  const sourceHash = stableHash(source);
  const destinationHash = stableHash(dest);
  return {
    entity,
    sourceCount,
    destinationCount,
    sourceHash,
    destinationHash,
    ok: sourceCount === destinationCount && sourceHash === destinationHash,
  };
}

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Migrate frozen rollout + P184/P185 state from local JSON into durable Postgres/PGlite.
 * Does not enable live mode or send paperwork.
 */
export async function migrateFrozenRolloutToDurableStore(input?: {
  client?: SqlClient;
  dataDir?: string;
  expectedRolloutId?: string;
}): Promise<P1855MigrationReport> {
  const errors: string[] = [];
  const db = input?.client ?? (await createSqlClient());
  await applyP1855Migrations(db);

  const dataDir = input?.dataDir ?? recruitingDataDir();
  const p184 = await readJsonIfExists<P184EngineStateFile>(
    path.join(dataDir, "p184-autonomous-paperwork-send-state.json"),
  );
  const p185 = await readJsonIfExists<P185RunnerStateFile>(
    path.join(dataDir, "p185-production-paperwork-automation-state.json"),
  );
  const p1853 = await readJsonIfExists<P1853RolloutStateFile>(
    path.join(dataDir, "p185-3-controlled-live-paperwork-rollout-state.json"),
  );

  if (!p184) errors.push("Source P184 state missing.");
  if (!p1853?.cohort) errors.push("Source P185.3 frozen cohort missing.");

  const beforeQueue = p184?.queue.filter((q) => q.status === "queued" || q.status === "failed_transient").length ?? 0;
  const beforeCohort = p1853?.cohort?.approvedCount ?? 0;
  const rolloutId = p1853?.cohort?.rolloutId ?? null;

  if (input?.expectedRolloutId && rolloutId && input.expectedRolloutId !== rolloutId) {
    errors.push(`Expected rollout ${input.expectedRolloutId} but found ${rolloutId}.`);
  }

  const recordsMigrated: Record<string, number> = {};
  const checksums: MigrationChecksum[] = [];

  // Ensure dry_run preserved
  if (p184) {
    p184.config = {
      ...p184.config,
      enabled: true,
      mode: "dry_run",
    };
  }

  await db.transaction(async (tx) => {
    if (p184) {
      await putDocument(DOC_KEYS.p184State, p184, tx);
      await tx.query(
        `INSERT INTO p184_config (id, payload, updated_at) VALUES ('default', $1::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
        [JSON.stringify(p184.config)],
      );
      await tx.query("DELETE FROM p184_queue_items");
      await tx.query("DELETE FROM p184_idempotency_keys");
      await tx.query("DELETE FROM p184_send_timestamps");

      for (const item of p184.queue) {
        await tx.query(
          `INSERT INTO p184_queue_items (
             candidate_id, rollout_id, idempotency_key, status, payload,
             priority_composite, enqueued_at, next_attempt_at, envelope_id_hash, updated_at
           ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::timestamptz,$8::timestamptz,$9,NOW())
           ON CONFLICT (candidate_id) DO UPDATE SET
             idempotency_key = EXCLUDED.idempotency_key,
             status = EXCLUDED.status,
             payload = EXCLUDED.payload,
             priority_composite = EXCLUDED.priority_composite,
             next_attempt_at = EXCLUDED.next_attempt_at,
             envelope_id_hash = EXCLUDED.envelope_id_hash,
             updated_at = NOW()`,
          [
            item.candidateId,
            rolloutId,
            item.idempotencyKey,
            item.status,
            JSON.stringify(item),
            item.priority?.composite ?? 0,
            item.enqueuedAt,
            item.nextAttemptAt,
            item.envelopeId ? hashEnvelopeId(item.envelopeId) : null,
          ],
        );
      }
      recordsMigrated.queueItems = p184.queue.length;

      for (const key of p184.completedIdempotencyKeys) {
        await tx.query(
          `INSERT INTO p184_idempotency_keys (idempotency_key, candidate_id, completed)
           VALUES ($1, $2, TRUE)
           ON CONFLICT (idempotency_key) DO UPDATE SET completed = TRUE`,
          [key, key.split(":")[0] ?? "unknown"],
        );
      }
      recordsMigrated.completedIdempotencyKeys = p184.completedIdempotencyKeys.length;

      for (const ts of p184.sendTimestamps) {
        await tx.query(`INSERT INTO p184_send_timestamps (sent_at) VALUES ($1::timestamptz)`, [ts]);
      }
      recordsMigrated.sendTimestamps = p184.sendTimestamps.length;
    }

    if (p185) {
      await putDocument(DOC_KEYS.p185State, p185, tx);
      await tx.query("DELETE FROM p185_operations");
      await tx.query("DELETE FROM p185_envelopes");
      for (const op of p185.operations ?? []) {
        await tx.query(
          `INSERT INTO p185_operations (
             id, candidate_id, idempotency_key, stage, envelope_id_hash, error, created_at, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::timestamptz)
           ON CONFLICT (id) DO UPDATE SET stage = EXCLUDED.stage, updated_at = EXCLUDED.updated_at`,
          [
            op.id,
            op.candidateId,
            op.idempotencyKey,
            op.stage,
            op.envelopeId ? hashEnvelopeId(op.envelopeId) : null,
            op.error,
            op.createdAt,
            op.updatedAt,
          ],
        );
      }
      recordsMigrated.operations = p185.operations?.length ?? 0;

      for (const env of p185.envelopes ?? []) {
        await tx.query(
          `INSERT INTO p185_envelopes (
             envelope_id_hash, candidate_id, idempotency_key, state, created_at, updated_at,
             verified_at, last_error, verification_attempts
           ) VALUES ($1,$2,$3,$4,$5::timestamptz,$6::timestamptz,$7::timestamptz,$8,$9)
           ON CONFLICT (envelope_id_hash) DO UPDATE SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at`,
          [
            hashEnvelopeId(env.envelopeId),
            env.candidateId,
            env.idempotencyKey,
            env.state,
            env.createdAt,
            env.updatedAt,
            env.verifiedAt,
            env.lastError,
            env.verificationAttempts,
          ],
        );
      }
      recordsMigrated.envelopes = p185.envelopes?.length ?? 0;

      if (p185.lease) {
        await tx.query(
          `INSERT INTO p185_leases (lease_key, owner_id, cycle_id, acquired_at, expires_at, heartbeat_at, version)
           VALUES ('p185:runner',$1,$2,$3::timestamptz,$4::timestamptz,$5::timestamptz,$6)
           ON CONFLICT (lease_key) DO UPDATE SET
             owner_id = EXCLUDED.owner_id,
             cycle_id = EXCLUDED.cycle_id,
             expires_at = EXCLUDED.expires_at,
             heartbeat_at = EXCLUDED.heartbeat_at,
             version = EXCLUDED.version`,
          [
            p185.lease.ownerId,
            p185.lease.cycleId,
            p185.lease.acquiredAt,
            p185.lease.expiresAt,
            p185.lease.heartbeatAt,
            p185.lease.version,
          ],
        );
        recordsMigrated.leases = 1;
      }
    }

    if (p1853?.cohort) {
      // Force dry_run continuity flags
      p1853.phase =
        p1853.phase === "canary_running" || p1853.phase === "backlog_releasing"
          ? "awaiting_configuration"
          : p1853.phase;
      await putDocument(DOC_KEYS.p1853State, p1853, tx);
      await tx.query(
        `INSERT INTO p1853_rollouts (rollout_id, cohort_id, frozen_at, approved_count, phase, payload, updated_at)
         VALUES ($1,$2,$3::timestamptz,$4,$5,$6::jsonb,NOW())
         ON CONFLICT (rollout_id) DO UPDATE SET
           approved_count = EXCLUDED.approved_count,
           phase = EXCLUDED.phase,
           payload = EXCLUDED.payload,
           updated_at = NOW()`,
        [
          p1853.cohort.rolloutId,
          p1853.cohort.cohortId,
          p1853.cohort.frozenAt,
          p1853.cohort.approvedCount,
          p1853.phase,
          JSON.stringify(p1853),
        ],
      );
      await tx.query(`DELETE FROM p1853_cohort_members WHERE rollout_id = $1`, [
        p1853.cohort.rolloutId,
      ]);
      for (const member of p1853.cohort.members) {
        await tx.query(
          `INSERT INTO p1853_cohort_members (
             rollout_id, candidate_id, resolved_position_id, template_key, email_hash,
             idempotency_key, queue_timestamp, evidence_refs, blocked_reason, removed, payload
           ) VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$8::jsonb,$9,$10,$11::jsonb)`,
          [
            p1853.cohort.rolloutId,
            member.candidateId,
            member.resolvedPositionId,
            member.templateKey,
            member.emailHash,
            member.idempotencyKey,
            member.queueTimestamp,
            JSON.stringify(member.evidenceRefs),
            member.blockedReason,
            member.removed,
            JSON.stringify(member),
          ],
        );
      }
      recordsMigrated.cohortMembers = p1853.cohort.members.length;
      recordsMigrated.rollouts = 1;

      // Audit continuity: cohort-related events only (no secrets / signing URLs).
      const auditRaw = await readJsonIfExists<{
        events?: Array<Record<string, unknown>>;
      }>(path.join(dataDir, "p184-paperwork-send-audit.json"));
      const cohortIds = new Set(p1853.cohort.members.map((m) => m.candidateId));
      const auditEvents = (auditRaw?.events ?? []).filter((e) => {
        const cid = typeof e.candidateId === "string" ? e.candidateId : "";
        return cohortIds.has(cid);
      });
      let migratedAudit = 0;
      for (const event of auditEvents.slice(-500)) {
        const detail: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(event)) {
          if (/secret|signing|sign_url|signUrl|api[_-]?key|token|password/i.test(k)) continue;
          if (k === "candidateName" || k === "candidateEmail" || k === "email") continue;
          detail[k] = v;
        }
        await appendAuditEvent({
          actor: P185_5_SOURCE_PHASE,
          action: typeof event.action === "string" ? event.action : "migrated_audit",
          candidateId: typeof event.candidateId === "string" ? event.candidateId : null,
          rolloutId: p1853.cohort.rolloutId,
          detail,
          client: tx,
        });
        migratedAudit += 1;
      }
      recordsMigrated.auditEvents = migratedAudit;
      await putDocument(
        DOC_KEYS.meta,
        {
          migratedAt: new Date().toISOString(),
          rolloutId: p1853.cohort.rolloutId,
          auditEventsMigrated: migratedAudit,
          sourceAuditTotal: auditRaw?.events?.length ?? 0,
        },
        tx,
      );
    }

    await appendAuditEvent({
      actor: P185_5_SOURCE_PHASE,
      action: "migrate_frozen_rollout",
      rolloutId,
      detail: {
        beforeQueue,
        beforeCohort,
        mode: "dry_run",
        liveSend: false,
      },
      client: tx,
    });
  });

  // Validate destination counts
  const queueCount = await db.query(
    `SELECT COUNT(*)::int AS n FROM p184_queue_items WHERE status IN ('queued','failed_transient','sending')`,
  );
  const cohortCount = await db.query(
    `SELECT COUNT(*)::int AS n FROM p1853_cohort_members WHERE rollout_id = $1`,
    [rolloutId],
  );
  const afterQueue = Number(queueCount.rows[0]?.n ?? 0);
  const afterCohort = Number(cohortCount.rows[0]?.n ?? 0);

  const destP184 = await db.query(`SELECT payload FROM p1855_documents WHERE doc_key = $1`, [
    DOC_KEYS.p184State,
  ]);
  const destP1853 = await db.query(`SELECT payload FROM p1855_documents WHERE doc_key = $1`, [
    DOC_KEYS.p1853State,
  ]);

  if (p184) {
    checksums.push(
      checksum(
        "p184_queue_candidate_ids",
        p184.queue.map((q) => q.candidateId).sort(),
        (
          await db.query(`SELECT candidate_id FROM p184_queue_items ORDER BY candidate_id`)
        ).rows.map((r) => String(r.candidate_id)),
        p184.queue.length,
        (
          await db.query(`SELECT COUNT(*)::int AS n FROM p184_queue_items`)
        ).rows[0]?.n as number,
      ),
    );
  }
  if (p1853?.cohort) {
    const memberIds = p1853.cohort.members.map((m) => m.candidateId).sort();
    const destIds = (
      await db.query(
        `SELECT candidate_id FROM p1853_cohort_members WHERE rollout_id = $1 ORDER BY candidate_id`,
        [rolloutId],
      )
    ).rows.map((r) => String(r.candidate_id));
    checksums.push(checksum("cohort_member_ids", memberIds, destIds, memberIds.length, destIds.length));
  }

  const seen = new Set<string>();
  const duplicateCandidateIds: string[] = [];
  for (const id of (p1853?.cohort?.members ?? []).map((m) => m.candidateId)) {
    if (seen.has(id)) duplicateCandidateIds.push(id);
    seen.add(id);
  }

  const sourceQueueIds = new Set(
    (p184?.queue ?? [])
      .filter((q) => q.status === "queued" || q.status === "failed_transient")
      .map((q) => q.candidateId),
  );
  const destQueueIds = new Set(
    (
      await db.query(
        `SELECT candidate_id FROM p184_queue_items WHERE status IN ('queued','failed_transient')`,
      )
    ).rows.map((r) => String(r.candidate_id)),
  );
  const missingQueueItems = [...sourceQueueIds].filter((id) => !destQueueIds.has(id));

  if (beforeCohort !== 25 && beforeCohort > 0) {
    errors.push(`Unexpected source cohort size ${beforeCohort} (expected 25).`);
  }
  if (afterCohort !== beforeCohort) {
    errors.push(`Cohort count mismatch: source ${beforeCohort} vs dest ${afterCohort}.`);
  }
  if (missingQueueItems.length) {
    errors.push(`Missing queue items after migration: ${missingQueueItems.length}.`);
  }
  if (duplicateCandidateIds.length) {
    errors.push(`Duplicate candidate IDs in cohort: ${duplicateCandidateIds.join(",")}.`);
  }
  if (!checksums.every((c) => c.ok)) {
    errors.push("One or more migration checksums failed.");
  }

  void destP184;
  void destP1853;

  return {
    phase: P185_5_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    provider: db.provider,
    schemaVersion: 1,
    rolloutId,
    before: { queueDepth: beforeQueue, frozenCohort: beforeCohort },
    after: { queueDepth: afterQueue, frozenCohort: afterCohort },
    recordsMigrated,
    checksums,
    duplicateCandidateIds,
    missingQueueItems,
    ok: errors.length === 0,
    errors,
  };
}
