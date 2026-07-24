import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildP245Preview } from "@/lib/p245-onboarding-paperwork-reminders/evaluate";
import { formatP245PreviewMarkdown } from "@/lib/p245-onboarding-paperwork-reminders/format";
import { sendP245ReminderBatch } from "@/lib/p245-onboarding-paperwork-reminders/send";
import type {
  P245ReminderSendRecord,
  P245RunResult,
} from "@/lib/p245-onboarding-paperwork-reminders/types";

export type P245RunOptions = {
  live?: boolean;
  confirmLive?: boolean;
  /** Force outbox/log sends even when Resend is unavailable (audit-only). */
  allowOutbox?: boolean;
  probeDropbox?: boolean;
  dropboxConcurrency?: number;
  artifactsDir?: string;
};

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function runP245OnboardingPaperworkReminders(
  options: P245RunOptions = {},
): Promise<P245RunResult> {
  const artifactsDir = options.artifactsDir ?? path.join(process.cwd(), "artifacts");
  const previewMdPath = path.join(artifactsDir, "p245-reminder-preview.md");
  const previewJsonPath = path.join(artifactsDir, "p245-reminder-preview.json");
  const sentJsonPath = path.join(artifactsDir, "p245-reminders-sent.json");
  const failuresJsonPath = path.join(artifactsDir, "p245-reminder-failures.json");

  const preview = await buildP245Preview({
    probeDropbox: options.probeDropbox,
    dropboxConcurrency: options.dropboxConcurrency,
  });

  let sent: P245ReminderSendRecord[] = [];
  let failures: P245ReminderSendRecord[] = [];
  let mode: "preview" | "live" = "preview";

  const wantsLive = Boolean(options.live && options.confirmLive);
  if (wantsLive) {
    mode = "live";
    const canDeliver = preview.mail.canLiveDeliver || Boolean(options.allowOutbox);
    if (!canDeliver) {
      failures = preview.eligible.map((row) => ({
        candidateId: row.candidateId,
        candidateName: row.candidateName,
        email: row.email!,
        signatureRequestId: row.signatureRequestId!,
        packetStatus: row.packetStatus,
        reminderTimestamp: new Date().toISOString(),
        reminderCount: row.reminderCount,
        emailDeliveryStatus: "blocked_no_mailer",
        messageId: null,
        error:
          preview.mail.blocker ??
          "Live mailer unavailable — set DIRECT_DEPOSIT_EMAIL_MODE=resend and RESEND_API_KEY",
      }));
    } else {
      const result = await sendP245ReminderBatch({
        eligible: preview.eligible,
        mail: preview.mail,
        requireLiveDelivery: preview.mail.canLiveDeliver && !options.allowOutbox,
      });
      sent = result.sent;
      failures = result.failures;
    }
  }

  preview.mode = mode;
  preview.metrics.sent = sent.filter((r) => r.emailDeliveryStatus === "sent" || r.emailDeliveryStatus === "logged_outbox").length;
  preview.metrics.deliveryFailures = failures.length;

  const previewPayload = {
    ...preview,
    execution: {
      liveRequested: wantsLive,
      allowOutbox: Boolean(options.allowOutbox),
      sentCount: sent.length,
      failureCount: failures.length,
    },
  };

  await writeJson(previewJsonPath, previewPayload);
  await writeFile(
    previewMdPath,
    formatP245PreviewMarkdown({ preview, sent, failures }),
    "utf8",
  );
  await writeJson(sentJsonPath, {
    phase: preview.phase,
    generatedAt: new Date().toISOString(),
    mode,
    count: sent.length,
    reminders: sent,
  });

  const failurePayload = {
    phase: preview.phase,
    generatedAt: new Date().toISOString(),
    mode,
    count: failures.length,
    mailBlocker: preview.mail.blocker,
    liveDeliveryReady: preview.mail.canLiveDeliver,
    requiredForLiveDelivery: [
      "Set RESEND_API_KEY in .env.local",
      "Set DIRECT_DEPOSIT_EMAIL_MODE=resend",
      "Re-run: npx tsx scripts/p245-run-paperwork-reminders.ts --live --confirm-live",
    ],
    failures,
  };
  await writeJson(failuresJsonPath, failurePayload);

  return {
    preview,
    sent,
    failures,
    artifacts: {
      previewMd: previewMdPath,
      previewJson: previewJsonPath,
      sentJson: sentJsonPath,
      failuresJson: failuresJsonPath,
    },
  };
}
