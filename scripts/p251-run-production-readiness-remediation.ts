/**
 * P251 — Production Readiness Remediation (read-only; no live sends)
 *
 *   npx tsx scripts/p251-run-production-readiness-remediation.ts
 *
 * Audits mail config, validates production startup diagnostics, writes recovery
 * + launch-validation + GO/NO-GO artifacts. Never accepts --live.
 * Does not invent or write RESEND_API_KEY values.
 */
import { existsSync, readFileSync } from "node:fs";
import { runP251ProductionReadinessRemediation } from "@/lib/p251-production-readiness-remediation";
import { formatProductionConfigDiagnostics } from "@/lib/production-mail-config";

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
      "[p251] Refusing live flags — this mission is remediation / zero-write only.",
    );
    process.exit(2);
  }

  loadEnvLocal();
  if (!process.env.DROPBOX_SIGN_TEST_MODE?.trim()) {
    process.env.DROPBOX_SIGN_TEST_MODE = "true";
  }

  console.log("[p251] Production readiness remediation starting (read-only)…");
  const result = await runP251ProductionReadinessRemediation();

  console.log(formatProductionConfigDiagnostics(result.productionConfig));

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: result.goNoGo.decision,
        highestImpactBlocker: result.goNoGo.highestImpactBlocker,
        okForLiveEmail: result.productionConfig.okForLiveEmail,
        deploymentTier: result.productionConfig.tier,
        failCount: result.productionConfig.failCount,
        recoveryTaskCount: result.recovery.tasks.length,
        expectedThroughput: result.goNoGo.expectedThroughput,
        estimatedReadyForMelToday: result.goNoGo.estimatedReadyForMelToday,
        expectedRecruiterTimeSavingsHours:
          result.goNoGo.expectedRecruiterTimeSavingsHours,
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
