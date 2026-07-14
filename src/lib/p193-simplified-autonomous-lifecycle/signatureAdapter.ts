import {
  applyReminderPlanToMetadata,
  mapDropboxEventToPaperworkStatus,
  planP193Reminder,
} from "@/lib/p193-simplified-autonomous-lifecycle/reminderEngine";
import type { P193LifecycleRecord } from "@/lib/p193-simplified-autonomous-lifecycle/types";
import { assertLegalP193Transition } from "@/lib/p193-simplified-autonomous-lifecycle/stateMachine";

/**
 * Signature monitoring adapter — maps Dropbox webhook event types onto
 * P193 metadata + lifecycle without rewriting Dropbox handlers.
 * Call from an observer (like P186.2 shadow) when enabled; default unused.
 */
export function applyDropboxEventToP193Record(input: {
  record: P193LifecycleRecord;
  eventType: string;
  nowIso?: string;
}): P193LifecycleRecord {
  const status = mapDropboxEventToPaperworkStatus(input.eventType);
  if (!status) return input.record;

  const nowIso = input.nowIso ?? new Date().toISOString();
  let state = input.record.state;
  const timeline = [...input.record.timeline];
  const metadata = {
    ...input.record.metadata,
    paperworkStatus: status,
    lastStatusChangeAt: nowIso,
  };

  if (status === "sent" && state === "Qualified") {
    assertLegalP193Transition(state, "Paperwork Sent");
    state = "Paperwork Sent";
    timeline.push({ at: nowIso, state, detail: `Dropbox event: ${input.eventType}` });
  } else if (status === "viewed") {
    metadata.lastViewedAt = nowIso;
    if (state === "Paperwork Sent" || state === "Awaiting Signature") {
      if (state === "Paperwork Sent") {
        assertLegalP193Transition(state, "Awaiting Signature");
        state = "Awaiting Signature";
        timeline.push({ at: nowIso, state, detail: "Envelope viewed" });
      }
    }
  } else if (status === "signed") {
    metadata.signatureTimestamp = nowIso;
    if (state !== "Signed" && state !== "Ready For Assignment") {
      if (state === "Paperwork Sent") {
        assertLegalP193Transition("Paperwork Sent", "Awaiting Signature");
        timeline.push({
          at: nowIso,
          state: "Awaiting Signature",
          detail: "Implicit await before signed",
        });
        state = "Awaiting Signature";
      }
      if (state === "Awaiting Signature" || state === "Qualified") {
        if (state === "Qualified") {
          // Unusual: signed without sent tracking — park in review
          state = "Needs Human Review";
          timeline.push({
            at: nowIso,
            state,
            detail: "Signed event without paperwork-sent state",
          });
        } else {
          assertLegalP193Transition("Awaiting Signature", "Signed");
          state = "Signed";
          timeline.push({ at: nowIso, state, detail: "All required documents signed" });
        }
      }
    }
  } else if (status === "expired") {
    state = "Expired";
    timeline.push({ at: nowIso, state, detail: "Envelope expired/canceled" });
  } else if (status === "declined" || status === "failed") {
    state = "Needs Human Review";
    timeline.push({ at: nowIso, state, detail: `Envelope ${status}` });
  }

  return {
    ...input.record,
    previousState: input.record.state,
    state,
    updatedAt: nowIso,
    metadata,
    timeline,
    version: input.record.version + 1,
  };
}

export function runReminderPass(
  records: P193LifecycleRecord[],
  nowMs = Date.now(),
): {
  plans: ReturnType<typeof planP193Reminder>[];
  updated: P193LifecycleRecord[];
} {
  const plans = records.map((r) => planP193Reminder(r, nowMs));
  const updated = records.map((r, i) => applyReminderPlanToMetadata(r, plans[i]!));
  return { plans, updated };
}
