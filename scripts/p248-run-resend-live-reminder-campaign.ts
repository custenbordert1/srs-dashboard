/**
 * P248 — Configure Resend and Execute P246 Live Reminder Campaign
 *
 * Configuration check + refreshed preview + frozen cohort (default):
 *   npx tsx scripts/p248-run-resend-live-reminder-campaign.ts
 *
 * Live canary (3) after Resend is configured:
 *   npx tsx scripts/p248-run-resend-live-reminder-campaign.ts --live --confirm-live
 *
 * Continue remaining frozen cohort after successful canary:
 *   npx tsx scripts/p248-run-resend-live-reminder-campaign.ts --live --confirm-live --continue-full
 *
 * Does NOT resend Dropbox Sign packets. Never logs RESEND_API_KEY.
 */
import { readFileSync } from "node:fs";
import { runP248ResendLiveReminderCampaign } from "@/lib/p248-resend-live-reminder-campaign";

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
    canaryOnly: argv.includes("--canary-only"),
    continueFull: argv.includes("--continue-full"),
  };
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));

  if (args.live && !args.confirmLive) {
    console.error("Refusing live send without --confirm-live");
    process.exit(2);
  }

  console.log("[p248] checking Resend configuration + refreshing Dropbox preview…");
  const result = await runP248ResendLiveReminderCampaign({
    live: args.live,
    confirmLive: args.confirmLive,
    canaryOnly: args.canaryOnly || (!args.continueFull && args.live),
    continueFull: args.continueFull,
  });

  const m = result.preview.metrics;
  console.log(
    JSON.stringify(
      {
        ok: true,
        readyForLive: result.config.readyForLive,
        stoppedBeforeLive: result.stoppedBeforeLive,
        stopReason: result.stopReason,
        blockers: result.config.blockers,
        from: result.config.resolvedFrom,
        replyTo: result.config.resolvedReplyTo,
        // Never print API key — only presence/length from config check
        resendKeyPresent: result.config.requiredEnv.RESEND_API_KEY.present,
        resendKeyLength: result.config.requiredEnv.RESEND_API_KEY.length,
        metrics: {
          evaluated: m.evaluated,
          dropboxVerified: m.dropboxVerified,
          eligibleReminder1: m.eligibleReminder1,
          frozen: result.frozen.count,
          canaryConfirmed: result.canarySent.length,
          fullConfirmed: result.fullSent.length,
          invalidEmail: m.invalidEmail,
          missingSignatureRequest: m.missingSignatureRequest,
          cooldownNotMet: m.cooldownNotMet,
          signedOrCompleted: m.signedOrCompleted,
        },
        dropboxPacketsResent: false,
        liveWritesOccurred: result.liveWritesOccurred,
        artifacts: result.artifacts,
      },
      null,
      2,
    ),
  );

  if (!result.config.readyForLive) {
    console.error("[p248] STOPPED — Resend is not configured for live delivery.");
    console.error("Required in .env.local:");
    console.error("  RESEND_API_KEY=<from https://resend.com/api-keys>");
    console.error("  DIRECT_DEPOSIT_EMAIL_MODE=resend");
    console.error("  SRS_RECRUITING_FROM_EMAIL=recruiting@strategicretailsolutions.com");
    console.error("  SRS_RECRUITING_REPLY_TO_EMAIL=recruiting@strategicretailsolutions.com");
    process.exitCode = 3;
  } else if (result.stoppedBeforeLive && args.live) {
    process.exitCode = 4;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
