import { createHash } from "node:crypto";
import {
  hasAlreadySentPaperwork,
  loadP243IdempotencyStore,
  normalizeEmailFingerprint,
  recordIdempotent,
  saveP243IdempotencyStore,
} from "@/lib/p243-autonomous-end-to-end-pipeline/idempotency";
import { P260_PHASE } from "@/lib/p260-live-paperwork-workspace/types";

/** Durable idempotency key: candidate + paperwork template identity. */
export function buildP260IdempotencyKey(candidateId: string, templateKey: string): string {
  return createHash("sha256")
    .update(`p260|${candidateId.trim()}|${templateKey.trim()}`)
    .digest("hex")
    .slice(0, 32);
}

const inFlightKeys = new Map<string, number>();
const IN_FLIGHT_TTL_MS = 120_000;

export function acquireP260InFlight(idempotencyKey: string, now = Date.now()): boolean {
  const existing = inFlightKeys.get(idempotencyKey);
  if (existing != null && now - existing < IN_FLIGHT_TTL_MS) {
    return false;
  }
  inFlightKeys.set(idempotencyKey, now);
  return true;
}

export function releaseP260InFlight(idempotencyKey: string): void {
  inFlightKeys.delete(idempotencyKey);
}

/** Test helper — clear in-flight locks. */
export function clearP260InFlightForTests(): void {
  inFlightKeys.clear();
}

/**
 * Reuse P243 durable idempotency store — do not invent a parallel store.
 */
export async function checkP260ExistingIdempotency(
  candidateId: string,
  email: string,
): Promise<{ blocked: boolean; reason: string | null }> {
  const store = await loadP243IdempotencyStore();
  return hasAlreadySentPaperwork(store, candidateId, email);
}

export async function recordP260Idempotency(input: {
  candidateId: string;
  email: string;
  signatureRequestId: string;
  idempotencyKey: string;
}): Promise<void> {
  const store = await loadP243IdempotencyStore();
  const next = recordIdempotent(store, {
    candidateId: input.candidateId,
    emailFingerprint: normalizeEmailFingerprint(input.email),
    fingerprint: input.idempotencyKey,
    outcome: "p260_sent",
    paperworkSent: true,
    signatureRequestId: input.signatureRequestId,
    processedAt: new Date().toISOString(),
    batchId: P260_PHASE,
  });
  await saveP243IdempotencyStore(next);
}
