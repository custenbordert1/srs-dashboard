/**
 * P249 — Daily Operations Mission (read-only / dry-run only)
 *
 *   npx tsx scripts/p249-run-daily-ops-mission.ts
 *   npx tsx scripts/p249-run-daily-ops-mission.ts --skip-dropbox-probe
 *
 * Never accepts --live. Produces artifacts/p249-*.{md,json}.
 */
import { existsSync, readFileSync } from "node:fs";
import { runP249DailyOpsMission } from "@/lib/p249-daily-ops-mission";

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

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (
    argv.includes("--live") ||
    argv.includes("--confirm-live") ||
    argv.includes("--confirmLive") ||
    argv.includes("--dry-run=false")
  ) {
    console.error("[p249] Refusing live flags — this mission is dry-run / read-only only.");
    process.exit(2);
  }

  loadEnvLocal();
  // Soft-lock accidental production Dropbox sends from env bleed-through during previews.
  if (!process.env.DROPBOX_SIGN_TEST_MODE?.trim()) {
    process.env.DROPBOX_SIGN_TEST_MODE = "true";
  }

  console.log("[p249] Daily ops mission starting (read-only / dry-run)…");
  const result = await runP249DailyOpsMission({
    probeDropbox: !argv.includes("--skip-dropbox-probe"),
    dropboxConcurrency: 6,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: result.goNoGo.decision,
        pipelineHealthScore: result.goNoGo.pipelineHealthScore,
        eligibleFirstTimePaperwork: result.goNoGo.eligibleFirstTimePaperwork,
        eligibleReminders: result.goNoGo.eligibleReminders,
        expectedReadyForMelToday: result.goNoGo.expectedReadyForMelToday,
        readinessOverall: result.readiness.overall,
        resendReady: result.readiness.modes.resendReady,
        zeroWritesConfirmed: result.dryRun.zeroWritesConfirmed,
        liveEmailsSent: result.dryRun.liveEmailsSent,
        blockers: result.goNoGo.blockers,
        artifacts: result.artifacts,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
