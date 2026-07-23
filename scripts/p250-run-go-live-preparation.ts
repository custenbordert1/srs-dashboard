/**
 * P250 — Production Go-Live Preparation and Controlled Launch (read-only)
 *
 *   npx tsx scripts/p250-run-go-live-preparation.ts
 *
 * Never accepts --live. Produces artifacts/p250-*.{md,json}.
 * Reuses P249 volume artifacts; refreshes readiness checks.
 */
import { existsSync, readFileSync } from "node:fs";
import { runP250GoLivePreparation } from "@/lib/p250-go-live-preparation";

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
    console.error(
      "[p250] Refusing live flags — this mission is preparation / read-only only.",
    );
    process.exit(2);
  }

  loadEnvLocal();
  if (!process.env.DROPBOX_SIGN_TEST_MODE?.trim()) {
    process.env.DROPBOX_SIGN_TEST_MODE = "true";
  }

  console.log("[p250] Go-live preparation starting (read-only)…");
  const result = await runP250GoLivePreparation();

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: result.goNoGo.decision,
        readinessScore: result.goNoGo.readinessScore,
        readinessOverall: result.blockers.readinessOverall,
        resendReady: result.blockers.modes.resendReady,
        blockerCount: result.blockers.blockers.length,
        expectedVolumes: result.goNoGo.expectedVolumes,
        onlyRemainingAction: result.goNoGo.onlyRemainingAction,
        liveEmailsSent: 0,
        dropboxWrites: 0,
        melWrites: 0,
        breezyWrites: 0,
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
