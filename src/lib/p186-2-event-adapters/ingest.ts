import { createHash } from "node:crypto";
import {
  deriveExpectedLifecycleState,
  happyPathIndex,
  isLegalTransition,
  LifecycleStateMachine,
} from "@/lib/p186-1-lifecycle-state-machine";
import type { P186LifecycleState } from "@/lib/p186-1-lifecycle-state-machine/types";
import { isAdapterEnabled, readP1862Flags, type P1862Flags } from "@/lib/p186-2-event-adapters/flags";
import { applyP1862Migrations } from "@/lib/p186-2-event-adapters/migrate";
import { targetStateForEvent } from "@/lib/p186-2-event-adapters/normalize";
import type {
  P186IngestResult,
  P186NormalizedLifecycleEvent,
} from "@/lib/p186-2-event-adapters/types";
import { createSqlClient } from "@/lib/p185-5-vercel-durable-storage/sqlClient";
import type { SqlClient } from "@/lib/p185-5-vercel-durable-storage/types";

export type ProductionStateReader = (candidateId: string) => Promise<{
  workflowStatus: string | null;
  paperworkStatus: string | null;
  paperworkSentAt: string | null;
  paperworkViewedAt: string | null;
  paperworkSignedAt: string | null;
  signatureRequestId: string | null;
  recommendedStage: string | null;
  hasOperatorApprovalEvidence?: boolean;
  directDepositStatus?: string | null;
} | null>;

/**
 * Shadow dual-write ingestor.
 * Writes ONLY to P186 shadow tables. Never mutates production systems.
 */
export class ShadowDualWriteIngestor {
  constructor(
    private readonly client?: SqlClient,
    private readonly flags: P1862Flags = readP1862Flags(),
    private readonly readProduction: ProductionStateReader = async () => null,
  ) {}

  async ingest(
    event: P186NormalizedLifecycleEvent,
  ): Promise<P186IngestResult> {
    try {
      return await this.ingestUnsafe(event);
    } catch (err) {
      return {
        disposition: "ingestion_failure",
        event,
        shadowStateBefore: null,
        shadowStateAfter: null,
        productionDerivedState: null,
        comparison: "skipped",
        detail: err instanceof Error ? err.message : String(err),
        auditId: null,
      };
    }
  }

  private async ingestUnsafe(
    event: P186NormalizedLifecycleEvent,
  ): Promise<P186IngestResult> {
    const db = this.client;
    if (db) await applyP1862Migrations(db);
    else await applyP1862Migrations();

    if (
      event.sourceSystem !== "synthetic" &&
      !isAdapterEnabled(this.flags, event.sourceSystem)
    ) {
      await this.persistInbox(event, "rejected_flag_off", "Adapter or shadow ingestion flag off");
      return {
        disposition: "rejected_flag_off",
        event,
        shadowStateBefore: null,
        shadowStateAfter: null,
        productionDerivedState: null,
        comparison: "skipped",
        detail: "Feature flag disabled",
        auditId: null,
      };
    }

    if (event.eventType === "unmapped") {
      await this.persistInbox(event, "unmapped", "Unmapped event type");
      return {
        disposition: "unmapped",
        event,
        shadowStateBefore: null,
        shadowStateAfter: null,
        productionDerivedState: null,
        comparison: "skipped",
        detail: "Unmapped event",
        auditId: null,
      };
    }

    const machine = new LifecycleStateMachine(this.client);
    const existingInbox = await this.findByIdempotency(event.idempotencyKey);
    if (existingInbox) {
      await this.persistComparison({
        eventId: event.eventId,
        candidateId: event.candidateId,
        comparison: "duplicate",
        productionDerivedState: null,
        shadowBefore: null,
        shadowAfter: null,
        detail: "Duplicate idempotency key",
      });
      return {
        disposition: "duplicate",
        event,
        shadowStateBefore: null,
        shadowStateAfter: null,
        productionDerivedState: null,
        comparison: "duplicate",
        detail: "Duplicate event suppressed",
        auditId: null,
      };
    }

    const shadowBefore = await machine.records.get(event.candidateId);
    const production = await this.readProduction(event.candidateId);
    const productionDerived = production
      ? deriveExpectedLifecycleState(production)
      : null;

    const target = targetStateForEvent(event.eventType);
    if (!target) {
      await this.persistInbox(event, "unmapped", "No target state");
      return {
        disposition: "unmapped",
        event,
        shadowStateBefore: shadowBefore?.state ?? null,
        shadowStateAfter: shadowBefore?.state ?? null,
        productionDerivedState: productionDerived,
        comparison: "skipped",
        detail: "No lifecycle target for event",
        auditId: null,
      };
    }

    // Late / out-of-order relative to shadow
    if (shadowBefore && isLate(shadowBefore.state, target, event.sourceTimestamp, shadowBefore.updatedAt)) {
      await this.persistInbox(event, "late", `Late event targeting ${target} while shadow=${shadowBefore.state}`);
      await this.persistComparison({
        eventId: event.eventId,
        candidateId: event.candidateId,
        comparison: "out_of_order",
        productionDerivedState: productionDerived,
        shadowBefore: shadowBefore.state,
        shadowAfter: shadowBefore.state,
        detail: "Late/out-of-order event recorded without regressing shadow",
      });
      return {
        disposition: "late",
        event,
        shadowStateBefore: shadowBefore.state,
        shadowStateAfter: shadowBefore.state,
        productionDerivedState: productionDerived,
        comparison: "out_of_order",
        detail: "Late event preserved; shadow not regressed",
        auditId: null,
      };
    }

    if (
      shadowBefore &&
      productionDerived &&
      shadowBefore.state !== productionDerived &&
      !isLegalTransition(shadowBefore.state, productionDerived) &&
      happyPathIndex(shadowBefore.state) > happyPathIndex(productionDerived) &&
      shadowBefore.state !== "BLOCKED" &&
      productionDerived !== "BLOCKED"
    ) {
      await this.persistInbox(event, "conflicting_source_state", "Shadow ahead of production-derived");
      await this.persistComparison({
        eventId: event.eventId,
        candidateId: event.candidateId,
        comparison: "conflicting_source_state",
        productionDerivedState: productionDerived,
        shadowBefore: shadowBefore.state,
        shadowAfter: shadowBefore.state,
        detail: `Conflict shadow=${shadowBefore.state} productionDerived=${productionDerived}`,
      });
      return {
        disposition: "conflicting_source_state",
        event,
        shadowStateBefore: shadowBefore.state,
        shadowStateAfter: shadowBefore.state,
        productionDerivedState: productionDerived,
        comparison: "conflicting_source_state",
        detail: "Conflicting source state",
        auditId: null,
      };
    }

    // Apply transition (seed path if needed)
    const applyResult = await this.applyToward(machine, event, target);
    const shadowAfter = await machine.records.get(event.candidateId);

    let comparison: P186IngestResult["comparison"] = "match";
    let disposition: P186IngestResult["disposition"] = "accepted";

    if (!applyResult.ok) {
      disposition =
        applyResult.code === "duplicate_event"
          ? "duplicate"
          : applyResult.code === "impossible_transition"
            ? "impossible_transition"
            : applyResult.code === "missing_predecessor"
              ? "missing_predecessor"
              : "invalid_transition";
      comparison =
        disposition === "duplicate"
          ? "duplicate"
          : disposition === "impossible_transition"
            ? "impossible_transition"
            : disposition === "missing_predecessor"
              ? "missing_predecessor"
              : "invalid_transition";
    } else if (productionDerived && shadowAfter?.state !== productionDerived) {
      disposition = "mismatch";
      comparison = "mismatch";
    } else {
      disposition = "accepted";
      comparison = "match";
    }

    await this.persistInbox(event, disposition, applyResult.detail);
    await this.persistComparison({
      eventId: event.eventId,
      candidateId: event.candidateId,
      comparison: comparison ?? "skipped",
      productionDerivedState: productionDerived,
      shadowBefore: shadowBefore?.state ?? null,
      shadowAfter: shadowAfter?.state ?? null,
      detail: applyResult.detail,
    });

    return {
      disposition,
      event,
      shadowStateBefore: shadowBefore?.state ?? null,
      shadowStateAfter: shadowAfter?.state ?? null,
      productionDerivedState: productionDerived,
      comparison,
      detail: applyResult.detail,
      auditId: applyResult.auditId,
    };
  }

  private async applyToward(
    machine: LifecycleStateMachine,
    event: P186NormalizedLifecycleEvent,
    target: P186LifecycleState,
  ): Promise<{ ok: boolean; code: string; detail: string; auditId: string | null }> {
    const current = await machine.records.get(event.candidateId);
    if (current?.state === target) {
      return { ok: true, code: "noop", detail: "Already at target", auditId: null };
    }

    if (!current) {
      const seed = await seedPath(machine, event, target);
      return seed;
    }

    if (isLegalTransition(current.state, target)) {
      const result = await machine.apply({
        candidateId: event.candidateId,
        toState: target,
        actor: event.actor.startsWith("user:") || event.actor.startsWith("operator:")
          ? (event.actor as `user:${string}` | `operator:${string}`)
          : "system:shadow",
        source: "production_observe",
        reason: `P186.2 observe ${event.eventType}`,
        eventId: event.eventId,
        correlationId: event.correlationId,
        at: event.sourceTimestamp,
      });
      return {
        ok: result.applied || result.validation.code === "noop_same_state",
        code: result.validation.code,
        detail: result.validation.message,
        auditId: result.auditId,
      };
    }

    // Try multi-step seed from current via rebuild — if target is forward, walk intermediates
    const walked = await walkForward(machine, event, current.state, target);
    return walked;
  }

  private async findByIdempotency(key: string): Promise<boolean> {
    const db = this.client ?? (await createSqlClient());
    await applyP1862Migrations(db);
    const result = await db.query(
      `SELECT 1 FROM p186_event_inbox WHERE idempotency_key = $1 OR event_id = $1 LIMIT 1`,
      [key],
    );
    return result.rowCount > 0;
  }

  private async persistInbox(
    event: P186NormalizedLifecycleEvent,
    disposition: string,
    detail: string,
  ): Promise<void> {
    const db = this.client ?? (await createSqlClient());
    await applyP1862Migrations(db);
    await db.query(
      `INSERT INTO p186_event_inbox (
         event_id, idempotency_key, candidate_id, event_type, source_system,
         source_timestamp, received_timestamp, actor, correlation_id, payload_version,
         redacted_metadata, disposition, detail
       ) VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7::timestamptz,$8,$9,$10,$11::jsonb,$12,$13)
       ON CONFLICT (event_id) DO NOTHING`,
      [
        event.eventId,
        event.idempotencyKey,
        event.candidateId,
        event.eventType,
        event.sourceSystem,
        event.sourceTimestamp,
        event.receivedTimestamp,
        event.actor,
        event.correlationId,
        event.payloadVersion,
        JSON.stringify(event.redactedMetadata),
        disposition,
        detail,
      ],
    );
  }

  private async persistComparison(input: {
    eventId: string;
    candidateId: string;
    comparison: string;
    productionDerivedState: string | null;
    shadowBefore: string | null;
    shadowAfter: string | null;
    detail: string;
  }): Promise<void> {
    const db = this.client ?? (await createSqlClient());
    await applyP1862Migrations(db);
    await db.query(
      `INSERT INTO p186_ingest_comparisons (
         event_id, candidate_id, comparison, production_derived_state,
         shadow_before, shadow_after, detail
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        input.eventId,
        input.candidateId,
        input.comparison,
        input.productionDerivedState,
        input.shadowBefore,
        input.shadowAfter,
        input.detail,
      ],
    );
  }
}

function isLate(
  shadow: P186LifecycleState,
  target: P186LifecycleState,
  sourceTs: string,
  shadowUpdatedAt: string,
): boolean {
  if (shadow === target) return false;
  const sIdx = happyPathIndex(shadow);
  const tIdx = happyPathIndex(target);
  if (sIdx < 0 || tIdx < 0) return false;
  if (tIdx >= sIdx) return false;
  // target behind shadow and source timestamp older than shadow update
  return Date.parse(sourceTs) < Date.parse(shadowUpdatedAt);
}

async function seedPath(
  machine: LifecycleStateMachine,
  event: P186NormalizedLifecycleEvent,
  target: P186LifecycleState,
): Promise<{ ok: boolean; code: string; detail: string; auditId: string | null }> {
  const order: P186LifecycleState[] = [
    "APPLIED",
    "RECRUITER_REVIEW",
    "HIRING_RECOMMENDATION",
    "OPERATOR_APPROVED",
    "PAPERWORK_NEEDED",
    "PAPERWORK_SENT",
    "VIEWED",
    "SIGNED",
    "ONBOARDING_COMPLETE",
    "READY_FOR_MEL",
    "EXPORTED",
  ];
  if (target === "BLOCKED") {
    const a = await machine.apply({
      candidateId: event.candidateId,
      toState: "APPLIED",
      actor: "system:shadow",
      source: "production_observe",
      reason: "seed",
      eventId: `${event.eventId}:seed-applied`,
    });
    const b = await machine.apply({
      candidateId: event.candidateId,
      toState: "BLOCKED",
      actor: "system:shadow",
      source: "production_observe",
      reason: event.eventType,
      eventId: event.eventId,
    });
    return {
      ok: b.applied,
      code: b.validation.code,
      detail: b.validation.message,
      auditId: b.auditId ?? a.auditId,
    };
  }
  const idx = order.indexOf(target);
  if (idx < 0) {
    return { ok: false, code: "unmapped", detail: "Unknown target", auditId: null };
  }
  let lastAudit: string | null = null;
  let prev: P186LifecycleState | null = null;
  for (let i = 0; i <= idx; i++) {
    const step = order[i]!;
    if (step === "VIEWED" && target !== "VIEWED") continue;
    if (prev && !isLegalTransition(prev, step) && !(prev === "PAPERWORK_SENT" && step === "SIGNED")) {
      // use SENT→SIGNED shortcut already legal
    }
    const result = await machine.apply({
      candidateId: event.candidateId,
      toState: step,
      actor: "system:shadow",
      source: "production_observe",
      reason: `seed:${step}`,
      eventId: `${event.eventId}:seed:${step}`,
    });
    if (!result.applied && result.validation.code !== "noop_same_state" && result.validation.code !== "duplicate_event") {
      return {
        ok: false,
        code: "missing_predecessor",
        detail: `Failed seed ${prev} → ${step}: ${result.validation.message}`,
        auditId: result.auditId,
      };
    }
    lastAudit = result.auditId;
    prev = step;
  }
  return { ok: true, code: "ok", detail: `Seeded to ${target}`, auditId: lastAudit };
}

async function walkForward(
  machine: LifecycleStateMachine,
  event: P186NormalizedLifecycleEvent,
  from: P186LifecycleState,
  target: P186LifecycleState,
): Promise<{ ok: boolean; code: string; detail: string; auditId: string | null }> {
  if (from === "PAPERWORK_SENT" && target === "SIGNED") {
    const result = await machine.apply({
      candidateId: event.candidateId,
      toState: "SIGNED",
      actor: "system:shadow",
      source: "production_observe",
      reason: event.eventType,
      eventId: event.eventId,
    });
    return {
      ok: result.applied,
      code: result.validation.code,
      detail: result.validation.message,
      auditId: result.auditId,
    };
  }

  const order: P186LifecycleState[] = [
    "APPLIED",
    "RECRUITER_REVIEW",
    "HIRING_RECOMMENDATION",
    "OPERATOR_APPROVED",
    "PAPERWORK_NEEDED",
    "PAPERWORK_SENT",
    "VIEWED",
    "SIGNED",
    "ONBOARDING_COMPLETE",
    "READY_FOR_MEL",
    "EXPORTED",
  ];
  const fromIdx = order.indexOf(from);
  const toIdx = order.indexOf(target);
  if (fromIdx < 0 || toIdx < 0 || toIdx <= fromIdx) {
    return {
      ok: false,
      code: "impossible_transition",
      detail: `Cannot walk ${from} → ${target}`,
      auditId: null,
    };
  }
  let lastAudit: string | null = null;
  let prev = from;
  for (let i = fromIdx + 1; i <= toIdx; i++) {
    const step = order[i]!;
    if (step === "VIEWED" && target !== "VIEWED") continue;
    if (!isLegalTransition(prev, step)) {
      return {
        ok: false,
        code: "missing_predecessor",
        detail: `Illegal intermediate ${prev} → ${step}`,
        auditId: null,
      };
    }
    const result = await machine.apply({
      candidateId: event.candidateId,
      toState: step,
      actor: "system:shadow",
      source: "production_observe",
      reason: `walk:${event.eventType}`,
      eventId: `${event.eventId}:walk:${step}`,
    });
    if (!result.applied && result.validation.code !== "noop_same_state") {
      return {
        ok: false,
        code: result.validation.code,
        detail: result.validation.message,
        auditId: result.auditId,
      };
    }
    lastAudit = result.auditId;
    prev = step;
  }
  return { ok: true, code: "ok", detail: `Walked to ${target}`, auditId: lastAudit };
}

export function hashOpaqueId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
