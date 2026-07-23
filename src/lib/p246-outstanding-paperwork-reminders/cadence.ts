import {
  P246_CADENCE_MS,
  P246_MAX_REMINDERS,
  type P246ReminderNumber,
} from "@/lib/p246-outstanding-paperwork-reminders/types";

export function buildP246IdempotencyKey(
  candidateId: string,
  signatureRequestId: string,
  reminderNumber: P246ReminderNumber,
): string {
  return `${candidateId}:${signatureRequestId}:${reminderNumber}`;
}

export function packetReminderKey(candidateId: string, signatureRequestId: string): string {
  return `${candidateId}:${signatureRequestId}`;
}

export function nextReminderNumber(reminderCount: number): P246ReminderNumber | null {
  if (reminderCount < 0) return 1;
  if (reminderCount >= P246_MAX_REMINDERS) return null;
  return (reminderCount + 1) as P246ReminderNumber;
}

/**
 * Anchor timestamp for the next reminder:
 * - Reminder 1: original paperwork send
 * - Reminder N: prior reminder send time
 */
export function cadenceAnchorIso(input: {
  nextReminderNumber: P246ReminderNumber;
  originalPaperworkSentAt: string | null;
  lastReminderAt: string | null;
}): string | null {
  if (input.nextReminderNumber === 1) return input.originalPaperworkSentAt;
  return input.lastReminderAt;
}

export function cadenceGapMs(reminderNumber: P246ReminderNumber): number {
  return P246_CADENCE_MS[reminderNumber];
}

export function isCadenceSatisfied(input: {
  nextReminderNumber: P246ReminderNumber;
  originalPaperworkSentAt: string | null;
  lastReminderAt: string | null;
  nowMs?: number;
}): { ok: boolean; reason: string | null; remainingMs: number } {
  const nowMs = input.nowMs ?? Date.now();
  const anchor = cadenceAnchorIso(input);
  if (!anchor) {
    return {
      ok: false,
      reason:
        input.nextReminderNumber === 1
          ? "missing_original_send_date"
          : "missing_prior_reminder_timestamp",
      remainingMs: Number.POSITIVE_INFINITY,
    };
  }
  const anchorMs = Date.parse(anchor);
  if (!Number.isFinite(anchorMs)) {
    return { ok: false, reason: "invalid_anchor_timestamp", remainingMs: Number.POSITIVE_INFINITY };
  }
  const required = cadenceGapMs(input.nextReminderNumber);
  const elapsed = nowMs - anchorMs;
  if (elapsed < required) {
    return {
      ok: false,
      reason: "cooldown_not_met",
      remainingMs: required - elapsed,
    };
  }
  return { ok: true, reason: null, remainingMs: 0 };
}
