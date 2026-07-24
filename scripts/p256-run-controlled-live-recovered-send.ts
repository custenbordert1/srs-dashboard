/**
 * P256 — Controlled Live Paperwork Send (Recovered Candidates)
 *
 * LIVE production Dropbox Sign for ONLY the P255-recovered authorized pair:
 *   - Sadio Mustafa (kaibusinessminded@gmail.com)
 *   - Melissa Lloyd (melissa lloyd)
 *
 * No other candidates. No bulk sends. No retries on failure.
 * Aborts if production quota is 0 / missing keys / testMode locked.
 * Does NOT fall back to testMode.
 *
 *   export AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED=true
 *   export AUTONOMOUS_PAPERWORK_LIVE_MODE=true
 *   export AUTONOMOUS_PAPERWORK_OPERATOR_GO=true
 *   npx tsx scripts/p256-run-controlled-live-recovered-send.ts --live --confirm-live
 *
 * Artifacts:
 *   artifacts/p256-live-send-report.md
 *   artifacts/p256-live-send-report.json
 *
 * Does NOT send reminder emails. Does NOT commit/push.
 */
import { existsSync, readFileSync } from "node:fs";
import {
  P256_CONFIRMATION_PHRASE,
  runP256ControlledLiveRecoveredSend,
} from "@/lib/p256-controlled-live-recovered-send";
import { resolveOpenStoresConfirmationPhrase } from "@/lib/p122-controlled-live-paperwork-pilot/live-pilot-env";

function loadEnvLocal(): void {
  if (!existsSync(".env.local")) return;
  const raw = readFileSync(".env.local", "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

function readStringFlag(argv: string[], name: string): string | null {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(`--${name}=`.length) || null;
  const idx = argv.indexOf(`--${name}`);
  if (idx >= 0) return argv[idx + 1] ?? null;
  return null;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  loadEnvLocal();

  const live = argv.includes("--live");
  const confirmLive = argv.includes("--confirm-live") || argv.includes("--confirmLive");
  if (!live || !confirmLive) {
    console.error(
      "[p256] Refusing to run without --live --confirm-live (production paperwork send).",
    );
    process.exit(2);
  }

  // Never allow accidental test-mode fallback for this mission.
  process.env.DROPBOX_SIGN_TEST_MODE = "false";
  process.env.NODE_ENV = "production";
  process.env.AUTONOMOUS_PAPERWORK_LIVE_PILOT_ENABLED = "true";
  process.env.AUTONOMOUS_PAPERWORK_LIVE_MODE = "true";
  process.env.AUTONOMOUS_PAPERWORK_OPERATOR_GO = "true";

  const confirmFlag = readStringFlag(argv, "confirm");
  const { phrase } = resolveOpenStoresConfirmationPhrase({
    live: true,
    confirmLive: true,
    confirmFlag,
  });

  console.log("[p256] Controlled LIVE recovered-candidate production send starting…");
  console.log("[p256] Authorized: Sadio Mustafa + Melissa Lloyd ONLY");
  console.log(`[p256] confirmationPhrase=${phrase ?? P256_CONFIRMATION_PHRASE}`);

  const result = await runP256ControlledLiveRecoveredSend({
    confirmationPhrase: phrase ?? P256_CONFIRMATION_PHRASE,
    allowNetworkGeocode: !argv.includes("--skip-network-geocode"),
    executeLive: true,
  });

  console.log(
    JSON.stringify(
      {
        ok: !result.aborted || result.counts.sent > 0,
        mode: result.mode,
        aborted: result.aborted,
        abortReason: result.abortReason,
        productionModeConfirmed: result.productionModeConfirmed,
        testMode: result.testMode,
        authorizedTargets: result.authorizedTargets.map((t) => ({
          candidateId: t.candidateId,
          name: t.name,
          email: t.email,
        })),
        quotaBefore: result.quotaBefore.accountQuotaRemaining,
        quotaAfter: result.quotaAfter.accountQuotaRemaining,
        counts: result.counts,
        candidates: result.candidates.map((c) => ({
          candidateId: c.candidateId,
          name: c.name,
          result: c.result,
          signatureRequestId: c.signatureRequestId,
          blockers: c.blockers,
          error: c.error,
        })),
        integrity: result.integrity.detail,
        artifacts: result.artifacts,
        reminderEmailsSent: 0,
        simulatedSends: 0,
      },
      null,
      2,
    ),
  );

  if (result.aborted && result.counts.sent === 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
