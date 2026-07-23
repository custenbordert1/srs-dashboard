import {
  P246_BATCH_PAUSE_MS,
  P246_BATCH_SIZE,
  P246_MAX_REMINDERS,
  type P246CandidateEvaluation,
  type P246DeliveryStatus,
  type P246FailureClass,
  type P246MailCapability,
  type P246ReminderNumber,
  type P246ReminderSendRecord,
} from "@/lib/p246-outstanding-paperwork-reminders/types";
import {
  buildP246IdempotencyKey,
  isCadenceSatisfied,
} from "@/lib/p246-outstanding-paperwork-reminders/cadence";
import {
  candidateSignerStillOutstanding,
  isEligibleDropboxStatus,
  packetIncludesEmail,
  probeDropboxLiveStatus,
} from "@/lib/p246-outstanding-paperwork-reminders/dropbox-status";
import {
  getPacketReminderState,
  hasIdempotencyKey,
  loadP246ReminderStore,
  markNeedsRecruiterFollowUp,
  recordSuccessfulReminder,
  saveP246ReminderStore,
} from "@/lib/p246-outstanding-paperwork-reminders/store";
import { buildP245ReminderEmail } from "@/lib/p245-onboarding-paperwork-reminders/template";
import { sendTransactionalEmail } from "@/lib/transactional-email";
import { isActiveInMel } from "@/lib/p245-onboarding-paperwork-reminders/eligibility";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";

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
  row: P246CandidateEvaluation;
  mail: P246MailCapability;
  reminderNumber: P246ReminderNumber;
  idempotencyKey: string;
  requireLiveDelivery: boolean;
}): Promise<{ ok: boolean; status: P246DeliveryStatus; messageId?: string; error?: string }> {
  const content = buildP245ReminderEmail({ firstName: input.row.firstName });
  const result = await sendTransactionalEmail(
    {
      from: input.mail.from,
      replyTo: input.mail.replyTo,
      to: input.row.email!,
      subject: content.subject,
      text: content.text,
      html: content.html,
      tags: ["p246", "onboarding-paperwork-reminder", `reminder-${input.reminderNumber}`],
    },
    {
      phase: "P246",
      candidateId: input.row.candidateId,
      signatureRequestId: input.row.signatureRequestId,
      reminderNumber: input.reminderNumber,
      idempotencyKey: input.idempotencyKey,
      dropboxLiveStatus: input.row.dropboxLiveStatus,
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

export type P246SendBatchResult = {
  sent: P246ReminderSendRecord[];
  skips: P246ReminderSendRecord[];
  failures: P246ReminderSendRecord[];
  stopCampaign: boolean;
  stopReason: string | null;
  unexplainedProviderErrors: number;
};

export async function sendP246ReminderBatch(input: {
  eligible: P246CandidateEvaluation[];
  mail: P246MailCapability;
  requireLiveDelivery: boolean;
  batchSize?: number;
  pauseMs?: number;
  /** Stop after this many unexplained provider errors (default 3 = more than two). */
  maxUnexplainedProviderErrors?: number;
  onBatchComplete?: (info: {
    batchIndex: number;
    sentSoFar: number;
    failuresSoFar: number;
    skipsSoFar: number;
  }) => Promise<void> | void;
}): Promise<P246SendBatchResult> {
  const batchSize = input.batchSize ?? P246_BATCH_SIZE;
  const pauseMs = input.pauseMs ?? P246_BATCH_PAUSE_MS;
  const maxUnexplained = input.maxUnexplainedProviderErrors ?? 3;
  const sent: P246ReminderSendRecord[] = [];
  const skips: P246ReminderSendRecord[] = [];
  const failures: P246ReminderSendRecord[] = [];
  let store = await loadP246ReminderStore();
  let stopCampaign = false;
  let stopReason: string | null = null;
  let unexplainedProviderErrors = 0;

  const workflows = await getCandidateWorkflowState();

  for (let i = 0; i < input.eligible.length; i += batchSize) {
    if (stopCampaign) break;
    const batch = input.eligible.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize);

    for (const row of batch) {
      if (stopCampaign) break;
      const timestamp = new Date().toISOString();
      const reminderNumber = row.nextReminderNumber;
      const signatureRequestId = row.signatureRequestId;
      if (!reminderNumber || !signatureRequestId || !row.email) {
        failures.push({
          candidateId: row.candidateId,
          candidateName: row.candidateName,
          email: row.email ?? "",
          signatureRequestId: signatureRequestId ?? "",
          dropboxLiveStatus: row.dropboxLiveStatus ?? "unknown",
          reminderNumber: (reminderNumber ?? 1) as P246ReminderNumber,
          idempotencyKey: row.idempotencyKey ?? "",
          reminderTimestamp: timestamp,
          reminderCount: row.reminderCount,
          emailDeliveryStatus: "failed",
          error: "Missing reminder number, signature request, or email at send time",
          failureClass: "system_configuration_error",
        });
        continue;
      }

      const idempotencyKey =
        row.idempotencyKey ??
        buildP246IdempotencyKey(row.candidateId, signatureRequestId, reminderNumber);

      const pushSkip = (failureClass: P246FailureClass, error: string, status = row.dropboxLiveStatus ?? "unknown") => {
        skips.push({
          candidateId: row.candidateId,
          candidateName: row.candidateName,
          email: row.email!,
          signatureRequestId,
          dropboxLiveStatus: status,
          reminderNumber,
          idempotencyKey,
          reminderTimestamp: timestamp,
          reminderCount: row.reminderCount,
          emailDeliveryStatus: "skipped",
          error,
          failureClass,
        });
      };

      if (hasIdempotencyKey(store, row.candidateId, signatureRequestId, idempotencyKey)) {
        pushSkip("duplicate_reminder_prevented", `Idempotency key already used: ${idempotencyKey}`);
        continue;
      }

      const packetState = getPacketReminderState(store, row.candidateId, signatureRequestId);
      if (packetState.reminderCount >= P246_MAX_REMINDERS) {
        store = markNeedsRecruiterFollowUp(store, row.candidateId, signatureRequestId, timestamp);
        pushSkip("maximum_reminders_reached", "Maximum reminders already reached");
        continue;
      }

      const cadence = isCadenceSatisfied({
        nextReminderNumber: reminderNumber,
        originalPaperworkSentAt: row.originalPaperworkSentAt,
        lastReminderAt: packetState.lastReminderAt,
      });
      if (!cadence.ok) {
        pushSkip("cooldown_not_met", cadence.reason ?? "Cadence not satisfied");
        continue;
      }

      const liveWorkflow = workflows[row.candidateId];
      if (liveWorkflow && isActiveInMel(liveWorkflow)) {
        pushSkip("active_in_mel", `workflowStatus=${liveWorkflow.workflowStatus}`);
        continue;
      }

      const probe = await probeDropboxLiveStatus(signatureRequestId, { forceRefresh: true });
      if (!probe.ok) {
        if (probe.failure === "system_configuration_error") {
          stopCampaign = true;
          stopReason = probe.error;
        }
        failures.push({
          candidateId: row.candidateId,
          candidateName: row.candidateName,
          email: row.email,
          signatureRequestId,
          dropboxLiveStatus: "unknown",
          reminderNumber,
          idempotencyKey,
          reminderTimestamp: timestamp,
          reminderCount: row.reminderCount,
          emailDeliveryStatus: "failed",
          error: probe.error,
          failureClass: probe.failure,
        });
        continue;
      }

      if (probe.status === "signed" || probe.status === "complete") {
        pushSkip("signed_before_send", `Packet became ${probe.status} before send`, probe.status);
        continue;
      }

      if (!isEligibleDropboxStatus(probe.status)) {
        pushSkip("signed_before_send", `Packet no longer outstanding (${probe.status})`, probe.status);
        continue;
      }

      if (!packetIncludesEmail(probe.summary, row.email)) {
        pushSkip("packet_email_mismatch", "Candidate email not on live Dropbox packet", probe.status);
        continue;
      }

      if (
        probe.status === "partially_signed" &&
        !candidateSignerStillOutstanding(probe.summary, row.email)
      ) {
        pushSkip("signed_before_send", "Candidate signer completed before send", probe.status);
        continue;
      }

      let attempt = await sendOnce({
        row,
        mail: input.mail,
        reminderNumber,
        idempotencyKey,
        requireLiveDelivery: input.requireLiveDelivery,
      });
      if (!attempt.ok && isTransientDeliveryError(attempt.error)) {
        await sleep(750);
        attempt = await sendOnce({
          row,
          mail: input.mail,
          reminderNumber,
          idempotencyKey,
          requireLiveDelivery: input.requireLiveDelivery,
        });
      }

      const record: P246ReminderSendRecord = {
        candidateId: row.candidateId,
        candidateName: row.candidateName,
        email: row.email,
        signatureRequestId,
        dropboxLiveStatus: probe.status,
        reminderNumber,
        idempotencyKey,
        reminderTimestamp: timestamp,
        reminderCount: attempt.ok ? packetState.reminderCount + 1 : packetState.reminderCount,
        emailDeliveryStatus: attempt.status,
        messageId: attempt.messageId ?? null,
        error: attempt.error ?? null,
      };

      const countsAsSuccess =
        attempt.ok && (!input.requireLiveDelivery || attempt.status === "sent");

      if (countsAsSuccess) {
        if (!attempt.messageId && attempt.status === "sent") {
          failures.push({
            ...record,
            emailDeliveryStatus: "failed",
            error: "Resend accepted send but returned no message id",
            failureClass: "resend_delivery_failed",
          });
          unexplainedProviderErrors += 1;
          if (unexplainedProviderErrors >= maxUnexplained) {
            stopCampaign = true;
            stopReason = "Multiple unexplained Resend provider errors";
          }
          continue;
        }

        try {
          store = recordSuccessfulReminder(store, {
            candidateId: row.candidateId,
            signatureRequestId,
            reminderNumber,
            idempotencyKey,
            sentAt: timestamp,
            email: row.email,
            deliveryStatus: attempt.status,
            messageId: attempt.messageId ?? null,
          });
          if (packetState.reminderCount + 1 >= P246_MAX_REMINDERS) {
            store = markNeedsRecruiterFollowUp(store, row.candidateId, signatureRequestId, timestamp);
          }
          await saveP246ReminderStore(store);
          sent.push(record);
        } catch (error) {
          stopCampaign = true;
          stopReason = "Reminder-history persistence became unavailable";
          failures.push({
            ...record,
            emailDeliveryStatus: "failed",
            error: error instanceof Error ? error.message : "Reminder history write failed",
            failureClass: "reminder_history_write_failed",
          });
        }
      } else if (attempt.ok && attempt.status === "logged_outbox" && input.requireLiveDelivery) {
        failures.push({
          ...record,
          emailDeliveryStatus: "blocked_no_mailer",
          error:
            input.mail.blocker ??
            "Mailer logged to outbox only; RESEND live delivery required",
          failureClass: "system_configuration_error",
        });
        stopCampaign = true;
        stopReason = input.mail.blocker ?? "Resend live delivery unavailable";
      } else {
        unexplainedProviderErrors += 1;
        failures.push({
          ...record,
          failureClass: "resend_delivery_failed",
        });
        const err = attempt.error ?? "";
        if (/unauthor|401|403|api key|authentication|invalid.?api/i.test(err)) {
          stopCampaign = true;
          stopReason = "Resend authentication failed";
        } else if (/domain|not verified|from address|sender/i.test(err)) {
          stopCampaign = true;
          stopReason = "Sender domain rejected by Resend";
        } else if (/429|rate.?limit/i.test(err)) {
          stopCampaign = true;
          stopReason = "Resend rate-limit errors";
        } else if (unexplainedProviderErrors >= maxUnexplained) {
          stopCampaign = true;
          stopReason = "Multiple unexplained provider errors";
        }
      }
    }

    if (input.onBatchComplete) {
      await input.onBatchComplete({
        batchIndex,
        sentSoFar: sent.length,
        failuresSoFar: failures.length,
        skipsSoFar: skips.length,
      });
    }

    if (i + batchSize < input.eligible.length && !stopCampaign) {
      await sleep(pauseMs);
    }
  }

  try {
    await saveP246ReminderStore(store);
  } catch (error) {
    stopCampaign = true;
    stopReason =
      stopReason ??
      `Reminder-history persistence failed on final save: ${
        error instanceof Error ? error.message : String(error)
      }`;
  }

  return {
    sent,
    skips,
    failures,
    stopCampaign,
    stopReason,
    unexplainedProviderErrors,
  };
}
