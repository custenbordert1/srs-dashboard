import { LifecycleAuditStore, LifecycleRecordStore, hasProcessedEvent, markProcessedEvent } from "@/lib/p186-1-lifecycle-state-machine/stores";
import { validateTransition } from "@/lib/p186-1-lifecycle-state-machine/transitionValidator";
import type {
  P186TransitionCommand,
  P186TransitionResult,
} from "@/lib/p186-1-lifecycle-state-machine/types";
import type { SqlClient } from "@/lib/p185-5-vercel-durable-storage/types";

/**
 * LifecycleStateMachine — sole mutator for P186 shadow lifecycle state.
 * Never imports Dropbox Sign send APIs. Never touches P184/P185 queues.
 */
export class LifecycleStateMachine {
  readonly records: LifecycleRecordStore;
  readonly audit: LifecycleAuditStore;

  constructor(client?: SqlClient) {
    this.records = new LifecycleRecordStore(client);
    this.audit = new LifecycleAuditStore(client);
    this.client = client;
  }

  private readonly client?: SqlClient;

  async apply(command: P186TransitionCommand): Promise<P186TransitionResult> {
    const at = command.at ?? new Date().toISOString();
    const eventId = command.eventId?.trim() || null;

    if (eventId) {
      const seen = await hasProcessedEvent(eventId, this.client);
      if (seen) {
        const current = await this.records.get(command.candidateId);
        const validation = validateTransition({
          fromState: current?.state ?? null,
          toState: command.toState,
          eventSeenBefore: true,
        });
        const audit = await this.audit.append({
          candidateId: command.candidateId,
          at,
          actor: command.actor,
          source: command.source,
          previousState: current?.state ?? null,
          newState: command.toState,
          reason: command.reason,
          correlationId: command.correlationId ?? eventId,
          accepted: false,
          rejectionCode: validation.code,
        });
        return {
          applied: false,
          validation,
          record: current,
          auditId: audit.id,
        };
      }
    }

    const current = await this.records.get(command.candidateId);
    const blockedReason =
      command.toState === "BLOCKED"
        ? command.reason
        : current?.blockedReason ?? null;

    const validation = validateTransition({
      fromState: current?.state ?? null,
      toState: command.toState,
      eventSeenBefore: false,
      blockedReason: command.toState === "BLOCKED" ? command.reason : null,
    });

    if (!validation.ok || command.dryValidate) {
      const audit = await this.audit.append({
        candidateId: command.candidateId,
        at,
        actor: command.actor,
        source: command.source,
        previousState: current?.state ?? null,
        newState: command.toState,
        reason: command.reason,
        correlationId: command.correlationId ?? eventId,
        accepted: false,
        rejectionCode: command.dryValidate && validation.ok ? "dry_validate" : validation.code,
      });
      return {
        applied: false,
        validation: command.dryValidate && validation.ok
          ? { ...validation, code: "ok", message: "Dry validate only — not persisted." }
          : validation,
        record: current,
        auditId: audit.id,
      };
    }

    const cas = await this.records.compareAndSet({
      candidateId: command.candidateId,
      expectedVersion: current?.version ?? null,
      state: command.toState,
      previousState: current?.state ?? null,
      blockedReason: command.toState === "BLOCKED" ? blockedReason : null,
      correlationId: command.correlationId ?? eventId,
      updatedAt: at,
    });

    if (!cas.ok) {
      const validationConflict = {
        ok: false as const,
        code: "cas_conflict" as const,
        fromState: current?.state ?? null,
        toState: command.toState,
        message: "CAS conflict — concurrent update.",
      };
      const audit = await this.audit.append({
        candidateId: command.candidateId,
        at,
        actor: command.actor,
        source: command.source,
        previousState: current?.state ?? null,
        newState: command.toState,
        reason: command.reason,
        correlationId: command.correlationId ?? eventId,
        accepted: false,
        rejectionCode: "cas_conflict",
      });
      return {
        applied: false,
        validation: validationConflict,
        record: cas.record,
        auditId: audit.id,
      };
    }

    const audit = await this.audit.append({
      candidateId: command.candidateId,
      at,
      actor: command.actor,
      source: command.source,
      previousState: current?.state ?? null,
      newState: command.toState,
      reason: command.reason,
      correlationId: command.correlationId ?? eventId,
      accepted: true,
      rejectionCode: null,
    });

    if (eventId) {
      await markProcessedEvent({
        eventId,
        candidateId: command.candidateId,
        auditId: audit.id,
        client: this.client,
      });
    }

    return {
      applied: true,
      validation,
      record: cas.record,
      auditId: audit.id,
    };
  }
}
