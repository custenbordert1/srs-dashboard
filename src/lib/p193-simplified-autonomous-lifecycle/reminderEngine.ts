import type {
  P193LifecycleRecord,
  P193PaperworkEnvelopeStatus,
  P193ReminderPlan,
} from "@/lib/p193-simplified-autonomous-lifecycle/types";

export const P193_REMINDER_1H_MS = 60 * 60 * 1000;
export const P193_REMINDER_24H_MS = 24 * 60 * 60 * 1000;
export const P193_REMINDER_48H_MS = 48 * 60 * 60 * 1000;
export const P193_EXPIRE_7D_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Reminder cadence (plan only unless reminderSendEnabled):
 * - 1h: unopened → reminder
 * - 24h: viewed but unsigned → reminder
 * - 48h: final reminder
 * - 7d: expire packet
 *
 * Idempotent: does not recommend duplicate reminders for the same bucket.
 */
export function planP193Reminder(
  record: P193LifecycleRecord,
  nowMs = Date.now(),
): P193ReminderPlan {
  const status = record.metadata.paperworkStatus;
  const sentAt = Date.parse(
    record.timeline.find((t) => t.state === "Paperwork Sent")?.at ??
      record.metadata.lastStatusChangeAt ??
      "",
  );
  const viewedAt = Date.parse(record.metadata.lastViewedAt ?? "");
  const lastReminderAt = Date.parse(record.metadata.lastReminderAt ?? "");
  const reminderCount = record.metadata.reminderCount ?? 0;

  const base = {
    candidateId: record.candidateId,
    reminderCount,
    wouldMutate: false,
  };

  if (status === "signed" || status === "declined" || status === "failed") {
    return { ...base, action: "none", due: false, reason: "terminal_envelope_status" };
  }
  if (status === "expired" || record.state === "Expired") {
    return { ...base, action: "none", due: false, reason: "already_expired" };
  }
  if (!["Paperwork Sent", "Awaiting Signature"].includes(record.state) && status === "not_sent") {
    return { ...base, action: "none", due: false, reason: "not_in_paperwork_phase" };
  }
  if (!Number.isFinite(sentAt)) {
    return { ...base, action: "none", due: false, reason: "missing_sent_timestamp" };
  }

  const age = nowMs - sentAt;

  if (age >= P193_EXPIRE_7D_MS) {
    return {
      ...base,
      action: "expire_7d",
      due: true,
      reason: "packet_older_than_7_days",
      wouldMutate: true,
    };
  }

  // Unopened → 1h reminder (reminder #1)
  if (status === "sent" && !Number.isFinite(viewedAt) && age >= P193_REMINDER_1H_MS) {
    if (reminderCount >= 1 && Number.isFinite(lastReminderAt)) {
      // escalate only at 48h final if still unopened
      if (age >= P193_REMINDER_48H_MS && reminderCount < 3) {
        return {
          ...base,
          action: "reminder_48h",
          due: true,
          reason: "unopened_final_reminder",
          wouldMutate: true,
        };
      }
      return { ...base, action: "none", due: false, reason: "unopened_reminder_already_sent" };
    }
    return {
      ...base,
      action: "reminder_1h",
      due: true,
      reason: "unopened_after_1h",
      wouldMutate: true,
    };
  }

  // Viewed but unsigned → 24h reminder
  if (
    (status === "viewed" || Number.isFinite(viewedAt)) &&
    Number.isFinite(viewedAt) &&
    nowMs - viewedAt >= P193_REMINDER_24H_MS
  ) {
    if (reminderCount >= 2 && age < P193_REMINDER_48H_MS) {
      return { ...base, action: "none", due: false, reason: "viewed_reminder_already_sent" };
    }
    if (age >= P193_REMINDER_48H_MS && reminderCount < 3) {
      return {
        ...base,
        action: "reminder_48h",
        due: true,
        reason: "viewed_final_reminder",
        wouldMutate: true,
      };
    }
    if (reminderCount < 2) {
      return {
        ...base,
        action: "reminder_24h",
        due: true,
        reason: "viewed_unsigned_after_24h",
        wouldMutate: true,
      };
    }
  }

  return { ...base, action: "none", due: false, reason: "within_cadence_window" };
}

export function applyReminderPlanToMetadata(
  record: P193LifecycleRecord,
  plan: P193ReminderPlan,
  nowIso = new Date().toISOString(),
): P193LifecycleRecord {
  if (!plan.due || plan.action === "none") return record;
  const metadata = { ...record.metadata };
  if (plan.action === "expire_7d") {
    metadata.paperworkStatus = "expired";
    metadata.lastStatusChangeAt = nowIso;
    return {
      ...record,
      state: "Expired",
      previousState: record.state,
      updatedAt: nowIso,
      metadata,
      timeline: [
        ...record.timeline,
        { at: nowIso, state: "Expired", detail: "Packet expired after 7 days" },
      ],
      version: record.version + 1,
    };
  }
  metadata.reminderCount = (metadata.reminderCount ?? 0) + 1;
  metadata.lastReminderAt = nowIso;
  return {
    ...record,
    updatedAt: nowIso,
    metadata,
    version: record.version + 1,
  };
}

export function mapDropboxEventToPaperworkStatus(
  eventType: string,
): P193PaperworkEnvelopeStatus | null {
  const t = eventType.toLowerCase();
  if (t.includes("viewed")) return "viewed";
  if (t.includes("all_signed") || t.includes("signed")) return "signed";
  if (t.includes("declined")) return "declined";
  if (t.includes("expired") || t.includes("cancel")) return "expired";
  if (t.includes("failed") || t.includes("error")) return "failed";
  if (t.includes("sent") || t.includes("signature_request_sent")) return "sent";
  return null;
}
