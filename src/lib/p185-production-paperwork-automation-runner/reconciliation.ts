import { getSignatureRequest, type DropboxSignRequestSummary } from "@/lib/dropbox-sign";
import {
  loadP185RunnerState,
  saveP185RunnerState,
} from "@/lib/p185-production-paperwork-automation-runner/durableStorage";
import type {
  P185EnvelopeLifecycleState,
  P185EnvelopeRecord,
  P185OperationRecord,
} from "@/lib/p185-production-paperwork-automation-runner/types";

export type P185ReconcileDeps = {
  getSignatureRequest?: typeof getSignatureRequest;
};

function mapDropboxToLifecycle(summary: DropboxSignRequestSummary): P185EnvelopeLifecycleState {
  if (summary.isDeclined) return "declined";
  if (summary.isComplete) return "signed";
  const status = (summary as { status?: string }).status?.toLowerCase?.() ?? "";
  if (status.includes("view")) return "viewed";
  if (status.includes("cancel")) return "canceled";
  if (status.includes("error") || status.includes("fail")) return "failed";
  if (summary.signatureRequestId) return "confirmed_sent";
  return "unknown";
}

export function upsertEnvelopeRecord(
  envelopes: P185EnvelopeRecord[],
  record: P185EnvelopeRecord,
): P185EnvelopeRecord[] {
  const idx = envelopes.findIndex((e) => e.envelopeId === record.envelopeId);
  if (idx < 0) return [...envelopes, record];
  const next = [...envelopes];
  next[idx] = record;
  return next;
}

export function upsertOperationRecord(
  operations: P185OperationRecord[],
  record: P185OperationRecord,
): P185OperationRecord[] {
  const idx = operations.findIndex((o) => o.id === record.id);
  if (idx < 0) return [...operations, record];
  const next = [...operations];
  next[idx] = record;
  return next;
}

/**
 * Verify envelopes marked sent_unverified. Never triggers a resend.
 */
export async function reconcileP185Envelopes(input?: {
  nowMs?: number;
  limit?: number;
  deps?: P185ReconcileDeps;
}): Promise<{
  checked: number;
  confirmed: number;
  failed: number;
  stillUnverified: number;
  transitions: Array<{ envelopeId: string; from: string; to: string }>;
}> {
  const nowMs = input?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const getSig = input?.deps?.getSignatureRequest ?? getSignatureRequest;
  const state = await loadP185RunnerState();

  // Crash recovery first so stuck send_requested rows become verifiable envelopes.
  const staleBefore = nowMs - (state.safety.leaseTtlMs || 90_000);
  for (const op of state.operations) {
    if (
      (op.stage === "processing" || op.stage === "send_requested") &&
      Date.parse(op.updatedAt) < staleBefore
    ) {
      if (op.envelopeId) {
        op.stage = "sent_unverified";
        op.updatedAt = nowIso;
        const existing = state.envelopes.find((e) => e.envelopeId === op.envelopeId);
        if (!existing) {
          state.envelopes = upsertEnvelopeRecord(state.envelopes, {
            candidateId: op.candidateId,
            envelopeId: op.envelopeId,
            idempotencyKey: op.idempotencyKey,
            state: "sent_unverified",
            createdAt: op.createdAt,
            updatedAt: nowIso,
            verifiedAt: null,
            lastError: "Recovered after crash — verification pending.",
            verificationAttempts: 0,
          });
        } else if (
          existing.state === "send_requested" ||
          existing.state === "prepared" ||
          existing.state === "unknown"
        ) {
          existing.state = "sent_unverified";
          existing.updatedAt = nowIso;
        }
      } else {
        op.stage = "retry_pending";
        op.updatedAt = nowIso;
        op.error = "Recovered stale processing record without envelope — retry send via P184.";
      }
    }
  }

  const unresolved = state.envelopes.filter(
    (e) =>
      e.state === "sent_unverified" ||
      e.state === "send_requested" ||
      e.state === "prepared" ||
      e.state === "unknown",
  );
  const batch = unresolved.slice(0, input?.limit ?? 50);
  let confirmed = 0;
  let failed = 0;
  const transitions: Array<{ envelopeId: string; from: string; to: string }> = [];

  for (const envelope of batch) {
    try {
      const summary = await getSig(envelope.envelopeId);
      const nextState = mapDropboxToLifecycle(summary);
      transitions.push({ envelopeId: envelope.envelopeId, from: envelope.state, to: nextState });
      envelope.state = nextState;
      envelope.updatedAt = nowIso;
      envelope.verifiedAt = nowIso;
      envelope.verificationAttempts += 1;
      envelope.lastError = null;
      if (nextState === "confirmed_sent" || nextState === "viewed" || nextState === "signed") {
        confirmed += 1;
      }
      if (nextState === "failed" || nextState === "declined" || nextState === "canceled") {
        failed += 1;
      }
      const op = state.operations.find(
        (o) => o.envelopeId === envelope.envelopeId || o.idempotencyKey === envelope.idempotencyKey,
      );
      if (op) {
        op.stage =
          nextState === "failed" || nextState === "declined" || nextState === "canceled"
            ? "failed"
            : "confirmed";
        op.updatedAt = nowIso;
        op.error = null;
      }
    } catch (err) {
      envelope.verificationAttempts += 1;
      envelope.updatedAt = nowIso;
      envelope.lastError = err instanceof Error ? err.message : "Verification failed";
      // Stay sent_unverified — do NOT resend.
      if (envelope.state === "send_requested") envelope.state = "sent_unverified";
    }
  }

  await saveP185RunnerState(state);
  const stillUnverified = state.envelopes.filter((e) => e.state === "sent_unverified").length;
  return {
    checked: batch.length,
    confirmed,
    failed,
    stillUnverified,
    transitions,
  };
}

export async function recordP185SendUnverified(input: {
  candidateId: string;
  envelopeId: string;
  idempotencyKey: string;
  nowMs?: number;
}): Promise<void> {
  const nowIso = new Date(input.nowMs ?? Date.now()).toISOString();
  const state = await loadP185RunnerState();
  state.envelopes = upsertEnvelopeRecord(state.envelopes, {
    candidateId: input.candidateId,
    envelopeId: input.envelopeId,
    idempotencyKey: input.idempotencyKey,
    state: "sent_unverified",
    createdAt: nowIso,
    updatedAt: nowIso,
    verifiedAt: null,
    lastError: null,
    verificationAttempts: 0,
  });
  const opId = `op-${input.idempotencyKey}`;
  state.operations = upsertOperationRecord(state.operations, {
    id: opId,
    candidateId: input.candidateId,
    idempotencyKey: input.idempotencyKey,
    stage: "sent_unverified",
    envelopeId: input.envelopeId,
    createdAt: nowIso,
    updatedAt: nowIso,
    error: null,
  });
  await saveP185RunnerState(state);
}
