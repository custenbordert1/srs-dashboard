import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildP246Preview } from "@/lib/p246-outstanding-paperwork-reminders/evaluate";
import {
  formatP246FinalMarkdown,
  formatP246PreviewMarkdown,
} from "@/lib/p246-outstanding-paperwork-reminders/format";
import { sendP246ReminderBatch } from "@/lib/p246-outstanding-paperwork-reminders/send";
import {
  loadP246ReminderStore,
  markNeedsRecruiterFollowUp,
  saveP246ReminderStore,
} from "@/lib/p246-outstanding-paperwork-reminders/store";
import { writeP246DashboardSnapshot } from "@/lib/p246-outstanding-paperwork-reminders/dashboard";
import type {
  P246CandidateEvaluation,
  P246ReminderSendRecord,
  P246RunResult,
} from "@/lib/p246-outstanding-paperwork-reminders/types";

export type P246RunOptions = {
  live?: boolean;
  confirmLive?: boolean;
  allowOutbox?: boolean;
  probeDropbox?: boolean;
  dropboxConcurrency?: number;
  applySafeCorrections?: boolean;
  artifactsDir?: string;
};

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function runP246OutstandingPaperworkReminders(
  options: P246RunOptions = {},
): Promise<P246RunResult> {
  const artifactsDir = options.artifactsDir ?? path.join(process.cwd(), "artifacts");
  const previewMdPath = path.join(artifactsDir, "p246-reminder-preview.md");
  const previewJsonPath = path.join(artifactsDir, "p246-reminder-preview.json");
  const sentJsonPath = path.join(artifactsDir, "p246-reminders-sent.json");
  const skipsJsonPath = path.join(artifactsDir, "p246-reminder-skips.json");
  const failuresJsonPath = path.join(artifactsDir, "p246-reminder-failures.json");
  const reconciliationJsonPath = path.join(artifactsDir, "p246-status-reconciliation.json");
  const needsFollowUpJsonPath = path.join(artifactsDir, "p246-needs-recruiter-follow-up.json");
  const finalMdPath = path.join(artifactsDir, "p246-final.md");
  const finalJsonPath = path.join(artifactsDir, "p246-final.json");

  const wantsLive = Boolean(options.live && options.confirmLive);

  // Always reconcile before any send. Safe corrections only when live confirmed
  // (or explicitly requested) so preview stays read-only by default.
  const preview = await buildP246Preview({
    probeDropbox: options.probeDropbox,
    dropboxConcurrency: options.dropboxConcurrency,
    applySafeCorrections:
      options.applySafeCorrections ?? wantsLive,
  });

  let sent: P246ReminderSendRecord[] = [];
  let skips: P246ReminderSendRecord[] = [];
  let failures: P246ReminderSendRecord[] = [];
  let mode: "preview" | "live" = "preview";
  let liveWritesOccurred = Boolean(
    preview.reconciliation.some((r) => r.action === "corrected_internal_to_signed"),
  );

  // Persist maximum-reminder → recruiter follow-up in store during live runs
  let needsRecruiterFollowUp: P246CandidateEvaluation[] = preview.evaluations.filter(
    (e) =>
      e.eligibilityResult === "needs_recruiter_follow_up" ||
      e.eligibilityResult === "maximum_reminders_reached",
  );

  if (wantsLive) {
    mode = "live";

    if (preview.stopCampaign) {
      // System-wide stop — no sends
      failures = preview.evaluations
        .filter((e) => e.eligible)
        .map((row) => ({
          candidateId: row.candidateId,
          candidateName: row.candidateName,
          email: row.email!,
          signatureRequestId: row.signatureRequestId!,
          dropboxLiveStatus: row.dropboxLiveStatus ?? "unknown",
          reminderNumber: row.nextReminderNumber ?? 1,
          idempotencyKey: row.idempotencyKey ?? "",
          reminderTimestamp: new Date().toISOString(),
          reminderCount: row.reminderCount,
          emailDeliveryStatus: "failed" as const,
          messageId: null,
          error: preview.stopReason ?? "Campaign stopped before send",
          failureClass: "system_configuration_error" as const,
        }));
    } else {
      const canDeliver = preview.mail.canLiveDeliver || Boolean(options.allowOutbox);
      if (!canDeliver) {
        failures = preview.evaluations
          .filter((e) => e.eligible)
          .map((row) => ({
            candidateId: row.candidateId,
            candidateName: row.candidateName,
            email: row.email!,
            signatureRequestId: row.signatureRequestId!,
            dropboxLiveStatus: row.dropboxLiveStatus ?? "unknown",
            reminderNumber: row.nextReminderNumber ?? 1,
            idempotencyKey: row.idempotencyKey ?? "",
            reminderTimestamp: new Date().toISOString(),
            reminderCount: row.reminderCount,
            emailDeliveryStatus: "blocked_no_mailer" as const,
            messageId: null,
            error:
              preview.mail.blocker ??
              "Live mailer unavailable — set DIRECT_DEPOSIT_EMAIL_MODE=resend and RESEND_API_KEY",
            failureClass: "system_configuration_error" as const,
          }));
      } else {
        // Refresh eligible after reconciliation corrections
        const eligible = preview.evaluations.filter((e) => e.eligible);
        const result = await sendP246ReminderBatch({
          eligible,
          mail: preview.mail,
          requireLiveDelivery: preview.mail.canLiveDeliver && !options.allowOutbox,
        });
        sent = result.sent;
        skips = result.skips;
        failures = result.failures;
        liveWritesOccurred = liveWritesOccurred || sent.length > 0;
        if (result.stopCampaign) {
          preview.stopCampaign = true;
          preview.stopReason = result.stopReason;
        }
      }

      // Mark max-reminder packets for recruiter follow-up in persistent store
      let store = await loadP246ReminderStore();
      let storeDirty = false;
      for (const row of needsRecruiterFollowUp) {
        if (!row.signatureRequestId) continue;
        const before = store.byPacketKey[`${row.candidateId}:${row.signatureRequestId}`];
        store = markNeedsRecruiterFollowUp(
          store,
          row.candidateId,
          row.signatureRequestId,
        );
        const after = store.byPacketKey[`${row.candidateId}:${row.signatureRequestId}`];
        if (after && (!before || !before.needsRecruiterFollowUp) && after.needsRecruiterFollowUp) {
          storeDirty = true;
          liveWritesOccurred = true;
        }
      }
      // Also include newly completed Reminder 4 sends
      for (const s of sent) {
        if (s.reminderNumber === 4 || s.reminderCount >= 4) {
          store = markNeedsRecruiterFollowUp(store, s.candidateId, s.signatureRequestId);
          storeDirty = true;
        }
      }
      if (storeDirty) {
        await saveP246ReminderStore(store);
      }

      // Refresh follow-up list from store marks
      needsRecruiterFollowUp = preview.evaluations.filter((e) => {
        if (!e.signatureRequestId) return false;
        const key = `${e.candidateId}:${e.signatureRequestId}`;
        return Boolean(store.byPacketKey[key]?.needsRecruiterFollowUp) ||
          e.eligibilityResult === "needs_recruiter_follow_up" ||
          e.eligibilityResult === "maximum_reminders_reached" ||
          (sent.some((s) => s.candidateId === e.candidateId && s.reminderNumber === 4));
      });
    }
  }

  preview.mode = mode;
  preview.metrics.attempted = sent.length + failures.filter((f) => f.failureClass === "resend_delivery_failed").length;
  preview.metrics.sent = sent.filter(
    (r) => r.emailDeliveryStatus === "sent" || r.emailDeliveryStatus === "logged_outbox",
  ).length;
  preview.metrics.deliveryFailures = failures.length;
  preview.metrics.skipped = skips.length;

  await writeP246DashboardSnapshot(preview.dashboard);

  const previewPayload = {
    ...preview,
    execution: {
      liveRequested: wantsLive,
      allowOutbox: Boolean(options.allowOutbox),
      sentCount: sent.length,
      skipCount: skips.length,
      failureCount: failures.length,
      liveWritesOccurred,
    },
  };

  await writeJson(previewJsonPath, previewPayload);
  await writeFile(
    previewMdPath,
    formatP246PreviewMarkdown({ preview, sent, skips, failures }),
    "utf8",
  );
  await writeJson(sentJsonPath, {
    phase: preview.phase,
    generatedAt: new Date().toISOString(),
    mode,
    count: sent.length,
    reminders: sent,
  });
  await writeJson(skipsJsonPath, {
    phase: preview.phase,
    generatedAt: new Date().toISOString(),
    mode,
    count: skips.length,
    skips,
  });
  await writeJson(failuresJsonPath, {
    phase: preview.phase,
    generatedAt: new Date().toISOString(),
    mode,
    count: failures.length,
    mailBlocker: preview.mail.blocker,
    liveDeliveryReady: preview.mail.canLiveDeliver,
    stopReason: preview.stopReason,
    requiredForLiveDelivery: [
      "Set RESEND_API_KEY in .env.local",
      "Set DIRECT_DEPOSIT_EMAIL_MODE=resend",
      "Re-run: npx tsx scripts/p246-run-outstanding-paperwork-reminders.ts --live --confirm-live",
    ],
    failures,
  });
  await writeJson(reconciliationJsonPath, {
    phase: preview.phase,
    generatedAt: new Date().toISOString(),
    mode,
    count: preview.reconciliation.length,
    correctionsApplied: preview.reconciliation.filter(
      (r) => r.action === "corrected_internal_to_signed",
    ).length,
    flaggedForInvestigation: preview.reconciliation.filter(
      (r) => r.action === "flagged_for_investigation",
    ).length,
    records: preview.reconciliation,
  });
  await writeJson(needsFollowUpJsonPath, {
    phase: preview.phase,
    generatedAt: new Date().toISOString(),
    mode,
    count: needsRecruiterFollowUp.length,
    candidates: needsRecruiterFollowUp,
  });

  const filesModified = [
    "src/lib/p246-outstanding-paperwork-reminders/*",
    "scripts/p246-run-outstanding-paperwork-reminders.ts",
    "src/app/api/p246-reminder-metrics/route.ts",
    "src/components/executive/p246-outstanding-paperwork-reminders-panel.tsx",
    "src/components/executive/executive-home-panel.tsx",
  ];
  const artifactsCreated = [
    previewMdPath,
    previewJsonPath,
    sentJsonPath,
    skipsJsonPath,
    failuresJsonPath,
    reconciliationJsonPath,
    needsFollowUpJsonPath,
    finalMdPath,
    finalJsonPath,
  ];

  const finalPayload = {
    phase: preview.phase,
    generatedAt: new Date().toISOString(),
    mode,
    mailMode: preview.mail.mode,
    liveWritesOccurred,
    metrics: preview.metrics,
    dashboard: preview.dashboard,
    totals: {
      candidatesEvaluated: preview.metrics.evaluated,
      dropboxVerified: preview.metrics.dropboxVerified,
      eligibleReminder1: preview.metrics.eligibleReminder1,
      eligibleReminder2: preview.metrics.eligibleReminder2,
      eligibleReminder3: preview.metrics.eligibleReminder3,
      eligibleReminder4: preview.metrics.eligibleReminder4,
      liveRemindersAttempted: preview.metrics.attempted,
      remindersConfirmedSent: preview.metrics.sent,
      signedExcluded: preview.metrics.signedOrCompleted,
      recentlyRemindedExcluded: preview.metrics.recentlyReminded + preview.metrics.cooldownNotMet,
      maximumReminderCandidates: preview.metrics.maximumRemindersReached,
      recruiterFollowUp: needsRecruiterFollowUp.length,
      invalidEmails: preview.metrics.invalidEmail,
      missingSignatureRequestIds: preview.metrics.missingSignatureRequest,
      statusConflicts: preview.metrics.statusConflicts,
      deliveryFailures: failures.length,
      resendMode: preview.mail.mode,
      liveWritesOccurred,
    },
    sentCount: sent.length,
    skipCount: skips.length,
    failureCount: failures.length,
    stopCampaign: preview.stopCampaign,
    stopReason: preview.stopReason,
    filesModified,
    artifactsCreated: artifactsCreated.map((p) => path.relative(process.cwd(), p)),
  };

  await writeJson(finalJsonPath, finalPayload);
  await writeFile(
    finalMdPath,
    formatP246FinalMarkdown({
      preview,
      sent,
      skips,
      failures,
      reconciliation: preview.reconciliation,
      needsRecruiterFollowUp,
      liveWritesOccurred,
      filesModified,
      artifactsCreated: finalPayload.artifactsCreated,
    }),
    "utf8",
  );

  return {
    preview,
    sent,
    skips,
    failures,
    reconciliation: preview.reconciliation,
    needsRecruiterFollowUp,
    liveWritesOccurred,
    artifacts: {
      previewMd: previewMdPath,
      previewJson: previewJsonPath,
      sentJson: sentJsonPath,
      skipsJson: skipsJsonPath,
      failuresJson: failuresJsonPath,
      reconciliationJson: reconciliationJsonPath,
      needsRecruiterFollowUpJson: needsFollowUpJsonPath,
      finalMd: finalMdPath,
      finalJson: finalJsonPath,
    },
  };
}
