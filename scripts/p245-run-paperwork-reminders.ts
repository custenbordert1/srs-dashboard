/**
 * P245 — Send Follow-Up Emails for Outstanding Onboarding Paperwork
 *
 * Preview (default):
 *   npx tsx scripts/p245-run-paperwork-reminders.ts
 *
 * Live send (requires Resend credentials + confirmation):
 *   npx tsx scripts/p245-run-paperwork-reminders.ts --live --confirm-live
 *
 * Optional: allow transactional outbox logging when Resend is unavailable
 *   npx tsx scripts/p245-run-paperwork-reminders.ts --live --confirm-live --allow-outbox
 *
 * Does NOT resend Dropbox Sign packets.
 */
import { readFileSync } from "node:fs";
import { runP245OnboardingPaperworkReminders } from "@/lib/p245-onboarding-paperwork-reminders";

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
  };
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));

  if (args.live && !args.confirmLive) {
    console.error("Refusing live send without --confirm-live");
    process.exit(2);
  }

  console.log("[p245] building reminder preview…");
  const result = await runP245OnboardingPaperworkReminders({
    live: args.live,
    confirmLive: args.confirmLive,
    allowOutbox: args.allowOutbox,
    probeDropbox: args.skipDropboxProbe ? false : undefined,
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
        metrics: {
          evaluated: m.evaluated,
          eligible: m.eligible,
          sent: m.sent,
          alreadySigned: m.alreadySigned,
          recentlyReminded: m.recentlyReminded,
          invalidEmail: m.invalidEmail,
          deliveryFailures: m.deliveryFailures,
        },
        artifacts: result.artifacts,
      },
      null,
      2,
    ),
  );

  if (args.live && !result.preview.mail.canLiveDeliver && !args.allowOutbox) {
    console.error(
      "[p245] Live delivery blocked — configure RESEND_API_KEY and DIRECT_DEPOSIT_EMAIL_MODE=resend, then re-run with --live --confirm-live",
    );
    process.exitCode = 3;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
