import {
  P214_BATCH_SIZE,
  P214_MIN_SEND_INTERVAL_MS,
  type P214CohortMember,
  type P214MonitorSummary,
  type P214SendAttempt,
} from "@/lib/p214-unsent-test-batch/types";

/** Split cohort members into batches of at most P214_BATCH_SIZE (5). */
export function planP214Batches(
  members: P214CohortMember[],
  batchSize: number = P214_BATCH_SIZE,
): P214CohortMember[][] {
  const size = Math.min(Math.max(1, batchSize), P214_BATCH_SIZE);
  const batches: P214CohortMember[][] = [];
  for (let i = 0; i < members.length; i += size) {
    batches.push(members.slice(i, i + size));
  }
  return batches;
}

/** Milliseconds to wait before the next send to stay at ≤ 4 requests/minute. */
export function p214NextSendDelayMs(
  lastSendAtMs: number,
  nowMs: number,
  minIntervalMs: number = P214_MIN_SEND_INTERVAL_MS,
): number {
  if (lastSendAtMs <= 0) return 0;
  return Math.max(0, lastSendAtMs + minIntervalMs - nowMs);
}

/**
 * Stop-on-error policy: any hard send failure halts the batch immediately.
 * Skips for pre-existing envelopes are safe and do not halt.
 */
export function p214ShouldStop(attempt: P214SendAttempt): boolean {
  return attempt.status === "send_failed";
}

export function summarizeP214Attempts(attempts: P214SendAttempt[]): P214MonitorSummary {
  const confirmed = attempts.filter((a) => a.status === "confirmed_test_sent");
  return {
    attempted: attempts.length,
    confirmed: confirmed.length,
    failed: attempts.filter((a) => a.status === "send_failed").length,
    skipped: attempts.filter((a) => a.status.startsWith("skipped")).length,
    duplicatePrevented: attempts.filter((a) => a.status === "skipped_existing_envelope").length,
    existingEnvelopeDiscovered: attempts.filter(
      (a) => a.status === "skipped_existing_envelope",
    ).length,
    viewed: attempts.filter((a) => a.dropboxStatus === "viewed").length,
    signedOrComplete: attempts.filter(
      (a) => a.dropboxStatus === "complete" || a.dropboxStatus === "partially_signed",
    ).length,
    requestIdsPresent: confirmed.filter((a) => Boolean(a.envelopeId)).length,
    testModeVerifiedCount: confirmed.filter((a) => a.testModeVerified === true).length,
    candidatesOutsideCohortTouched: 0,
  };
}
