import {
  P245_BATCH_PAUSE_MS,
  P245_BATCH_SIZE,
  type P245CandidateEvaluation,
  type P245DeliveryStatus,
  type P245MailCapability,
  type P245ReminderSendRecord,
} from "@/lib/p245-onboarding-paperwork-reminders/types";
import {
  loadP245ReminderStore,
  recordSuccessfulReminder,
  saveP245ReminderStore,
} from "@/lib/p245-onboarding-paperwork-reminders/store";
import { buildP245ReminderEmail } from "@/lib/p245-onboarding-paperwork-reminders/template";
import { sendTransactionalEmail } from "@/lib/transactional-email";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientDeliveryError(error: string | undefined): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return (
    lower.includes("timeout") ||
    lower.includes("429") ||
    lower.includes("rate") ||
    lower.includes("temporar") ||
    lower.includes("503") ||
    lower.includes("502") ||
    lower.includes("econnreset") ||
    lower.includes("fetch failed")
  );
}

async function sendOnce(input: {
  row: P245CandidateEvaluation;
  mail: P245MailCapability;
  requireLiveDelivery: boolean;
}): Promise<{ ok: boolean; status: P245DeliveryStatus; messageId?: string; error?: string }> {
  const content = buildP245ReminderEmail({ firstName: input.row.firstName });
  const result = await sendTransactionalEmail(
    {
      from: input.mail.from,
      replyTo: input.mail.replyTo,
      to: input.row.email!,
      subject: content.subject,
      text: content.text,
      html: content.html,
      tags: ["p245", "onboarding-paperwork-reminder"],
    },
    {
      phase: "P245",
      candidateId: input.row.candidateId,
      signatureRequestId: input.row.signatureRequestId,
      packetStatus: input.row.packetStatus,
    },
    { requireLiveDelivery: input.requireLiveDelivery },
  );

  if (!result.ok) {
    return { ok: false, status: "failed", error: result.error ?? "Email send failed" };
  }

  if (result.mode === "resend") {
    return { ok: true, status: "sent", messageId: result.messageId };
  }
  return { ok: true, status: "logged_outbox", messageId: result.messageId };
}

export async function sendP245ReminderBatch(input: {
  eligible: P245CandidateEvaluation[];
  mail: P245MailCapability;
  /** When false, only Resend delivery counts as success for store increments. */
  requireLiveDelivery: boolean;
  batchSize?: number;
  pauseMs?: number;
}): Promise<{ sent: P245ReminderSendRecord[]; failures: P245ReminderSendRecord[] }> {
  const batchSize = input.batchSize ?? P245_BATCH_SIZE;
  const pauseMs = input.pauseMs ?? P245_BATCH_PAUSE_MS;
  const sent: P245ReminderSendRecord[] = [];
  const failures: P245ReminderSendRecord[] = [];
  let store = await loadP245ReminderStore();

  for (let i = 0; i < input.eligible.length; i += batchSize) {
    const batch = input.eligible.slice(i, i + batchSize);
    for (const row of batch) {
      const timestamp = new Date().toISOString();
      let attempt = await sendOnce({
        row,
        mail: input.mail,
        requireLiveDelivery: input.requireLiveDelivery,
      });

      if (!attempt.ok && isTransientDeliveryError(attempt.error)) {
        await sleep(750);
        attempt = await sendOnce({
          row,
          mail: input.mail,
          requireLiveDelivery: input.requireLiveDelivery,
        });
      }

      const countAfter = (store.byCandidateId[row.candidateId]?.reminderCount ?? row.reminderCount) + 1;
      const record: P245ReminderSendRecord = {
        candidateId: row.candidateId,
        candidateName: row.candidateName,
        email: row.email!,
        signatureRequestId: row.signatureRequestId!,
        packetStatus: row.packetStatus,
        reminderTimestamp: timestamp,
        reminderCount: attempt.ok ? countAfter : row.reminderCount,
        emailDeliveryStatus: attempt.status,
        messageId: attempt.messageId ?? null,
        error: attempt.error ?? null,
      };

      const countsAsSuccess =
        attempt.ok &&
        (!input.requireLiveDelivery || attempt.status === "sent");

      if (countsAsSuccess) {
        store = recordSuccessfulReminder(store, {
          candidateId: row.candidateId,
          sentAt: timestamp,
          email: row.email!,
          signatureRequestId: row.signatureRequestId!,
          deliveryStatus: attempt.status,
          messageId: attempt.messageId ?? null,
        });
        sent.push(record);
      } else if (attempt.ok && attempt.status === "logged_outbox" && input.requireLiveDelivery) {
        failures.push({
          ...record,
          emailDeliveryStatus: "blocked_no_mailer",
          error:
            input.mail.blocker ??
            "Mailer logged to outbox only; RESEND live delivery required for candidate delivery",
        });
      } else {
        failures.push(record);
      }
    }

    if (i + batchSize < input.eligible.length) {
      await sleep(pauseMs);
    }
  }

  await saveP245ReminderStore(store);
  return { sent, failures };
}
