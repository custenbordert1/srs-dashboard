import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildP246Preview } from "@/lib/p246-outstanding-paperwork-reminders/evaluate";
import { formatP246PreviewMarkdown } from "@/lib/p246-outstanding-paperwork-reminders/format";
import { sendP246ReminderBatch } from "@/lib/p246-outstanding-paperwork-reminders/send";
import { loadP246ReminderStore } from "@/lib/p246-outstanding-paperwork-reminders/store";
import type {
  P246CandidateEvaluation,
  P246PreviewReport,
  P246ReminderSendRecord,
} from "@/lib/p246-outstanding-paperwork-reminders/types";
import { buildP248CleanupReports } from "@/lib/p248-resend-live-reminder-campaign/cleanup";
import {
  checkP248ResendConfiguration,
  formatP248ResendConfigurationMarkdown,
} from "@/lib/p248-resend-live-reminder-campaign/config-check";
import { freezeP248Reminder1Cohort } from "@/lib/p248-resend-live-reminder-campaign/freeze";
import {
  P248_APPROVED_FROM_FALLBACK,
  P248_PHASE,
  type P248FrozenCohort,
  type P248ResendConfigCheck,
} from "@/lib/p248-resend-live-reminder-campaign/types";

export type P248RunOptions = {
  live?: boolean;
  confirmLive?: boolean;
  canaryOnly?: boolean;
  continueFull?: boolean;
  probeDropbox?: boolean;
  dropboxConcurrency?: number;
  artifactsDir?: string;
};

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function evaluationsForIds(
  preview: P246PreviewReport,
  ids: string[],
): P246CandidateEvaluation[] {
  const set = new Set(ids);
  return preview.evaluations.filter((e) => set.has(e.candidateId) && e.eligible);
}

function countByFailure(
  rows: P246ReminderSendRecord[],
  klass: string,
): number {
  return rows.filter((r) => r.failureClass === klass).length;
}

export type P248RunResult = {
  config: P248ResendConfigCheck;
  preview: P246PreviewReport;
  frozen: P248FrozenCohort;
  canarySent: P246ReminderSendRecord[];
  canarySkips: P246ReminderSendRecord[];
  canaryFailures: P246ReminderSendRecord[];
  fullSent: P246ReminderSendRecord[];
  fullSkips: P246ReminderSendRecord[];
  fullFailures: P246ReminderSendRecord[];
  liveWritesOccurred: boolean;
  dropboxPacketsResent: false;
  stoppedBeforeLive: boolean;
  stopReason: string | null;
  artifacts: Record<string, string>;
};

export async function runP248ResendLiveReminderCampaign(
  options: P248RunOptions = {},
): Promise<P248RunResult> {
  const artifactsDir = options.artifactsDir ?? path.join(process.cwd(), "artifacts");
  const paths = {
    configMd: path.join(artifactsDir, "p248-resend-configuration-check.md"),
    previewMd: path.join(artifactsDir, "p248-live-preview.md"),
    previewJson: path.join(artifactsDir, "p248-live-preview.json"),
    frozenJson: path.join(artifactsDir, "p248-frozen-reminder-cohort.json"),
    canaryJson: path.join(artifactsDir, "p248-canary-results.json"),
    confirmedJson: path.join(artifactsDir, "p248-reminders-confirmed.json"),
    skipsJson: path.join(artifactsDir, "p248-reminder-skips.json"),
    failuresJson: path.join(artifactsDir, "p248-reminder-failures.json"),
    invalidCleanupJson: path.join(artifactsDir, "p248-invalid-email-cleanup.json"),
    missingSigCleanupJson: path.join(
      artifactsDir,
      "p248-missing-signature-request-cleanup.json",
    ),
    finalMd: path.join(artifactsDir, "p248-final.md"),
    finalJson: path.join(artifactsDir, "p248-final.json"),
  };

  const wantsLive = Boolean(options.live && options.confirmLive);
  const config = await checkP248ResendConfiguration();
  await writeFile(paths.configMd, formatP248ResendConfigurationMarkdown(config), "utf8");

  // Fresh Dropbox-verified preview (no assumption that prior 144 still holds).
  const preview = await buildP246Preview({
    probeDropbox: options.probeDropbox,
    dropboxConcurrency: options.dropboxConcurrency,
    applySafeCorrections: false,
  });
  preview.mode = wantsLive && config.readyForLive ? "live" : "preview";

  // Prefer recruiting From/Reply for artifact clarity even in preview.
  if (!process.env.SRS_RECRUITING_FROM_EMAIL?.trim()) {
    preview.mail.from = config.resolvedFrom.includes("humanresource")
      ? P248_APPROVED_FROM_FALLBACK
      : config.resolvedFrom;
  }
  if (!process.env.SRS_RECRUITING_REPLY_TO_EMAIL?.trim()) {
    preview.mail.replyTo = config.resolvedReplyTo.includes("humanresource")
      ? P248_APPROVED_FROM_FALLBACK
      : config.resolvedReplyTo;
  }

  await writeJson(paths.previewJson, {
    ...preview,
    p248: {
      configReady: config.readyForLive,
      blockers: config.blockers,
    },
  });
  await writeFile(
    paths.previewMd,
    `# P248 — Live Preview (refreshed Dropbox)\n\n` +
      formatP246PreviewMarkdown({ preview, sent: [], skips: [], failures: [] }),
    "utf8",
  );

  const frozen = await freezeP248Reminder1Cohort(preview);
  await writeJson(paths.frozenJson, frozen);

  const cleanup = await buildP248CleanupReports(preview);
  await writeJson(paths.invalidCleanupJson, {
    phase: P248_PHASE,
    generatedAt: new Date().toISOString(),
    count: cleanup.invalidEmails.length,
    candidates: cleanup.invalidEmails,
  });
  await writeJson(paths.missingSigCleanupJson, {
    phase: P248_PHASE,
    generatedAt: new Date().toISOString(),
    count: cleanup.missingSignatureRequests.length,
    candidates: cleanup.missingSignatureRequests,
  });

  let canarySent: P246ReminderSendRecord[] = [];
  let canarySkips: P246ReminderSendRecord[] = [];
  let canaryFailures: P246ReminderSendRecord[] = [];
  let fullSent: P246ReminderSendRecord[] = [];
  let fullSkips: P246ReminderSendRecord[] = [];
  let fullFailures: P246ReminderSendRecord[] = [];
  let liveWritesOccurred = false;
  let stoppedBeforeLive = false;
  let stopReason: string | null = null;
  let canaryPayload: Record<string, unknown> = {
    phase: P248_PHASE,
    generatedAt: new Date().toISOString(),
    attempted: 0,
    confirmed: 0,
    ok: false,
    skipped: true,
    reason: "Canary not executed",
    canaryCandidateIds: frozen.canaryCandidateIds,
    dropboxPacketsResent: false,
    sent: [],
    skips: [],
    failures: [],
  };

  if (!wantsLive) {
    stoppedBeforeLive = true;
    stopReason = "Preview/freeze only — pass --live --confirm-live to send";
    canaryPayload = {
      ...canaryPayload,
      reason: stopReason,
    };
  } else if (!config.readyForLive) {
    stoppedBeforeLive = true;
    stopReason = `Resend not ready: ${config.blockers.join("; ")}`;
    canaryPayload = {
      ...canaryPayload,
      reason: stopReason,
      blockers: config.blockers,
    };
  } else if (preview.stopCampaign) {
    stoppedBeforeLive = true;
    stopReason = preview.stopReason ?? "Preview stopCampaign flag set";
    canaryPayload = { ...canaryPayload, reason: stopReason };
  } else {
    const mail = {
      ...preview.mail,
      from: process.env.SRS_RECRUITING_FROM_EMAIL?.trim() || P248_APPROVED_FROM_FALLBACK,
      replyTo:
        process.env.SRS_RECRUITING_REPLY_TO_EMAIL?.trim() ||
        process.env.SRS_RECRUITING_FROM_EMAIL?.trim() ||
        P248_APPROVED_FROM_FALLBACK,
      mode: "resend" as const,
      canLiveDeliver: true,
      blocker: null,
    };

    // --- Canary ---
    const canaryEvals = evaluationsForIds(preview, frozen.canaryCandidateIds);
    const canaryResult = await sendP246ReminderBatch({
      eligible: canaryEvals,
      mail,
      requireLiveDelivery: true,
      batchSize: 3,
      maxUnexplainedProviderErrors: 3,
    });
    canarySent = canaryResult.sent;
    canarySkips = canaryResult.skips;
    canaryFailures = canaryResult.failures;
    liveWritesOccurred = canarySent.length > 0;

    const canaryOk =
      canarySent.length === 3 &&
      canaryFailures.length === 0 &&
      canarySent.every((s) => s.emailDeliveryStatus === "sent" && Boolean(s.messageId)) &&
      !canaryResult.stopCampaign;

    canaryPayload = {
      phase: P248_PHASE,
      generatedAt: new Date().toISOString(),
      attempted: canaryEvals.length,
      confirmed: canarySent.length,
      ok: canaryOk,
      skipped: false,
      stopCampaign: canaryResult.stopCampaign,
      stopReason: canaryResult.stopReason,
      from: mail.from,
      replyTo: mail.replyTo,
      dropboxPacketsResent: false,
      canaryCandidateIds: frozen.canaryCandidateIds,
      sent: canarySent,
      skips: canarySkips,
      failures: canaryFailures,
    };

    if (!canaryOk) {
      stopReason =
        canaryResult.stopReason ??
        `Canary failed: confirmed=${canarySent.length}/3 failures=${canaryFailures.length}`;
    } else if (options.canaryOnly || !options.continueFull) {
      // Default after successful canary: stop for operator validation unless --continue-full
      stopReason =
        "Canary succeeded — stopped for validation. Re-run with --live --confirm-live --continue-full to send remaining frozen cohort.";
    } else {
      // --- Full remaining cohort ---
      const remainingEvals = evaluationsForIds(preview, frozen.remainingCandidateIds);
      const fullResult = await sendP246ReminderBatch({
        eligible: remainingEvals,
        mail,
        requireLiveDelivery: true,
        batchSize: 25,
        pauseMs: 1500,
        maxUnexplainedProviderErrors: 3,
        onBatchComplete: async (info) => {
          console.log(
            `[p248] batch ${info.batchIndex + 1} complete — sent=${info.sentSoFar} skips=${info.skipsSoFar} failures=${info.failuresSoFar}; pausing before next batch`,
          );
        },
      });
      fullSent = fullResult.sent;
      fullSkips = fullResult.skips;
      fullFailures = fullResult.failures;
      liveWritesOccurred = liveWritesOccurred || fullSent.length > 0;
      if (fullResult.stopCampaign) {
        stopReason = fullResult.stopReason;
      }
    }
  }

  const allSent = [...canarySent, ...fullSent];
  const allSkips = [...canarySkips, ...fullSkips];
  const allFailures = [...canaryFailures, ...fullFailures];

  await writeJson(paths.canaryJson, canaryPayload);

  await writeJson(paths.confirmedJson, {
    phase: P248_PHASE,
    generatedAt: new Date().toISOString(),
    count: allSent.length,
    canaryCount: canarySent.length,
    fullCount: fullSent.length,
    dropboxPacketsResent: false,
    reminders: allSent,
  });
  await writeJson(paths.skipsJson, {
    phase: P248_PHASE,
    generatedAt: new Date().toISOString(),
    count: allSkips.length,
    skips: allSkips,
  });
  await writeJson(paths.failuresJson, {
    phase: P248_PHASE,
    generatedAt: new Date().toISOString(),
    count: allFailures.length,
    failures: allFailures,
  });

  const store = await loadP246ReminderStore();
  const reminderHistoryCount = Object.values(store.byPacketKey).reduce(
    (n, row) => n + (row.history?.length ?? 0),
    0,
  );

  const dispositions: Record<string, number> = {};
  for (const e of preview.evaluations) {
    dispositions[e.eligibilityResult] = (dispositions[e.eligibilityResult] ?? 0) + 1;
  }
  const dispositionSum = Object.values(dispositions).reduce((a, b) => a + b, 0);

  const filesModified = [
    "src/lib/p248-resend-live-reminder-campaign/*",
    "scripts/p248-run-resend-live-reminder-campaign.ts",
    "src/lib/p246-outstanding-paperwork-reminders/send.ts",
  ];
  const artifactsCreated = Object.values(paths).map((p) => path.relative(process.cwd(), p));

  const finalPayload = {
    phase: P248_PHASE,
    generatedAt: new Date().toISOString(),
    totals: {
      resendConfigurationStatus: config.readyForLive ? "ready" : "blocked",
      senderDomainVerificationStatus: config.senderVerification.domainStatus,
      fromAddressUsed: config.resolvedFrom.includes("humanresource")
        ? P248_APPROVED_FROM_FALLBACK
        : config.resolvedFrom,
      replyToAddressUsed: config.resolvedReplyTo.includes("humanresource")
        ? P248_APPROVED_FROM_FALLBACK
        : config.resolvedReplyTo,
      candidatesEvaluated: preview.metrics.evaluated,
      dropboxVerified: preview.metrics.dropboxVerified,
      eligibleReminder1: preview.metrics.eligibleReminder1,
      frozenCohortCount: frozen.count,
      canaryAttempted: canarySent.length + canaryFailures.length + canarySkips.length,
      canaryConfirmed: canarySent.length,
      fullCampaignAttempted: fullSent.length + fullFailures.length + fullSkips.length,
      fullCampaignConfirmed: fullSent.length,
      signedBeforeSendSkips: countByFailure(allSkips, "signed_before_send"),
      recentlyRemindedSkips:
        countByFailure(allSkips, "cooldown_not_met") +
        preview.metrics.recentlyReminded +
        preview.metrics.cooldownNotMet,
      invalidEmailSkips: preview.metrics.invalidEmail,
      dropboxVerificationFailures: preview.metrics.dropboxLookupFailures,
      resendDeliveryFailures: allFailures.filter((f) => f.failureClass === "resend_delivery_failed")
        .length,
      duplicateRemindersPrevented: countByFailure(allSkips, "duplicate_reminder_prevented"),
      finalReminderHistoryCount: reminderHistoryCount,
      dropboxPacketsResent: false,
      liveWritesOccurred,
    },
    dispositions,
    dispositionSum,
    dispositionReconciles: dispositionSum === preview.metrics.evaluated,
    blockers: config.blockers,
    stopReason,
    stoppedBeforeLive,
    filesModified,
    artifactsCreated,
  };

  await writeJson(paths.finalJson, finalPayload);

  const md = [
    `# P248 — Resend Live Reminder Campaign Final Report`,
    ``,
    `**Generated:** ${finalPayload.generatedAt}`,
    `**Ready for live:** ${config.readyForLive ? "yes" : "no"}`,
    `**Stopped before live:** ${stoppedBeforeLive ? "yes" : "no"}`,
    stopReason ? `**Stop reason:** ${stopReason}` : null,
    ``,
    `## Configuration`,
    ``,
    `| Item | Value |`,
    `|---|---|`,
    `| Resend configuration | ${finalPayload.totals.resendConfigurationStatus} |`,
    `| Sender domain verification | ${finalPayload.totals.senderDomainVerificationStatus ?? "not attempted"} |`,
    `| From address | ${finalPayload.totals.fromAddressUsed} |`,
    `| Reply-to address | ${finalPayload.totals.replyToAddressUsed} |`,
    ``,
    `## Cohort`,
    ``,
    `| # | Metric | Count |`,
    `|---|---|---|`,
    `| 5 | Candidates evaluated | ${finalPayload.totals.candidatesEvaluated} |`,
    `| 6 | Dropbox verified | ${finalPayload.totals.dropboxVerified} |`,
    `| 7 | Eligible Reminder 1 | ${finalPayload.totals.eligibleReminder1} |`,
    `| — | Frozen cohort | ${finalPayload.totals.frozenCohortCount} |`,
    `| 8 | Canary attempted | ${finalPayload.totals.canaryAttempted} |`,
    `| 9 | Canary confirmed | ${finalPayload.totals.canaryConfirmed} |`,
    `| 10 | Full-campaign attempted | ${finalPayload.totals.fullCampaignAttempted} |`,
    `| 11 | Full-campaign confirmed | ${finalPayload.totals.fullCampaignConfirmed} |`,
    `| 12 | Signed-before-send skips | ${finalPayload.totals.signedBeforeSendSkips} |`,
    `| 13 | Cadence / recently reminded | ${finalPayload.totals.recentlyRemindedSkips} |`,
    `| 14 | Invalid email exclusions | ${finalPayload.totals.invalidEmailSkips} |`,
    `| 15 | Dropbox verification failures | ${finalPayload.totals.dropboxVerificationFailures} |`,
    `| 16 | Resend delivery failures | ${finalPayload.totals.resendDeliveryFailures} |`,
    `| 17 | Duplicate reminders prevented | ${finalPayload.totals.duplicateRemindersPrevented} |`,
    `| 18 | Reminder-history count | ${finalPayload.totals.finalReminderHistoryCount} |`,
    `| 19 | Dropbox packets resent | no |`,
    `| 20 | Live writes occurred | ${liveWritesOccurred ? "yes" : "no"} |`,
    ``,
    `Disposition sum ${dispositionSum} / evaluated ${preview.metrics.evaluated} — ${
      dispositionSum === preview.metrics.evaluated ? "reconciles" : "MISMATCH"
    }.`,
    ``,
    config.blockers.length
      ? `## Blockers\n\n${config.blockers.map((b) => `- ${b}`).join("\n")}\n`
      : "",
    `## Exact next step`,
    ``,
    `1. Add \`RESEND_API_KEY\` and \`DIRECT_DEPOSIT_EMAIL_MODE=resend\` to \`.env.local\` (do not commit).`,
    `2. Set \`SRS_RECRUITING_FROM_EMAIL=${P248_APPROVED_FROM_FALLBACK}\` and matching reply-to.`,
    `3. Verify the From domain in Resend.`,
    `4. Re-run: \`npx tsx scripts/p248-run-resend-live-reminder-campaign.ts --live --confirm-live\``,
    `5. After canary success, continue with \`--continue-full\`.`,
    ``,
    `## Files modified`,
    ``,
    ...filesModified.map((f) => `- \`${f}\``),
    ``,
    `## Artifacts created`,
    ``,
    ...artifactsCreated.map((f) => `- \`${f}\``),
    ``,
  ].filter((line): line is string => line !== null);

  await writeFile(paths.finalMd, `${md.join("\n")}\n`, "utf8");

  return {
    config,
    preview,
    frozen,
    canarySent,
    canarySkips,
    canaryFailures,
    fullSent,
    fullSkips,
    fullFailures,
    liveWritesOccurred,
    dropboxPacketsResent: false,
    stoppedBeforeLive,
    stopReason,
    artifacts: paths,
  };
}
