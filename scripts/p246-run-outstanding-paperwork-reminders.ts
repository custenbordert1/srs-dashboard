/**
 * P246 — Harden and Execute Outstanding Paperwork Reminder Campaign
 *
 * Preview (default):
 *   npx tsx scripts/p246-run-outstanding-paperwork-reminders.ts
 *
 * Live send (requires Resend + Dropbox Sign + confirmation):
 *   npx tsx scripts/p246-run-outstanding-paperwork-reminders.ts --live --confirm-live
 *
 * Optional: allow transactional outbox logging when Resend is unavailable
 *   npx tsx scripts/p246-run-outstanding-paperwork-reminders.ts --live --confirm-live --allow-outbox
 *
 * Does NOT resend Dropbox Sign packets. Dropbox Sign is the source of truth.
 */
import { readFileSync } from "node:fs";
import { runP246OutstandingPaperworkReminders } from "@/lib/p246-outstanding-paperwork-reminders";

function loadEnvLocal(): void {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    // optional
  }
}

function parseArgs(argv: string[]) {
  return {
    live: argv.includes("--live"),
    confirmLive: argv.includes("--confirm-live"),
    allowOutbox: argv.includes("--allow-outbox"),
    skipDropboxProbe: argv.includes("--skip-dropbox-probe"),
    applySafeCorrections: argv.includes("--apply-safe-corrections"),
  };
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));

  if (args.live && !args.confirmLive) {
    console.error("Refusing live send without --confirm-live");
    process.exit(2);
  }

  console.log("[p246] building reminder preview / reconciliation…");
  const result = await runP246OutstandingPaperworkReminders({
    live: args.live,
    confirmLive: args.confirmLive,
    allowOutbox: args.allowOutbox,
    probeDropbox: args.skipDropboxProbe ? false : undefined,
    applySafeCorrections: args.applySafeCorrections || undefined,
  });

  const m = result.preview.metrics;
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: result.preview.mode,
        mail: {
          mode: result.preview.mail.mode,
          canLiveDeliver: result.preview.mail.canLiveDeliver,
          blocker: result.preview.mail.blocker,
        },
        stopCampaign: result.preview.stopCampaign,
        stopReason: result.preview.stopReason,
        liveWritesOccurred: result.liveWritesOccurred,
        metrics: {
          evaluated: m.evaluated,
          dropboxVerified: m.dropboxVerified,
          eligibleReminder1: m.eligibleReminder1,
          eligibleReminder2: m.eligibleReminder2,
          eligibleReminder3: m.eligibleReminder3,
          eligibleReminder4: m.eligibleReminder4,
          eligibleTotal: m.eligibleTotal,
          sent: m.sent,
          signedOrCompleted: m.signedOrCompleted,
          recentlyReminded: m.recentlyReminded + m.cooldownNotMet,
          maximumRemindersReached: m.maximumRemindersReached,
          needsRecruiterFollowUp: result.needsRecruiterFollowUp.length,
          invalidEmail: m.invalidEmail,
          missingSignatureRequest: m.missingSignatureRequest,
          statusConflicts: m.statusConflicts,
          deliveryFailures: m.deliveryFailures,
        },
        artifacts: result.artifacts,
      },
      null,
      2,
    ),
  );

  if (args.live && result.preview.stopCampaign) {
    console.error(`[p246] Campaign stopped: ${result.preview.stopReason}`);
    process.exitCode = 4;
  } else if (args.live && !result.preview.mail.canLiveDeliver && !args.allowOutbox) {
    console.error(
      "[p246] Live delivery blocked — configure RESEND_API_KEY and DIRECT_DEPOSIT_EMAIL_MODE=resend, then re-run with --live --confirm-live",
    );
    process.exitCode = 3;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
