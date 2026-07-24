/**
 * P252 — Production Email Validation & GO-LIVE Verification
 *
 *   npx tsx scripts/p252-run-production-email-validation.ts
 *
 * Validates runtime mail config, probes Resend when key is present, and sends
 * ONE internal test email only when production mail is fully configured and
 * SRS_INTERNAL_TEST_EMAIL (or SRS_OPS_TEST_EMAIL) is set.
 *
 * Never prints secrets. Never sends to candidates. Never resends paperwork.
 * Does not invent RESEND_API_KEY or test addresses.
 */
import { existsSync, readFileSync } from "node:fs";
import { runP252ProductionEmailValidation } from "@/lib/p252-production-email-validation";
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
  // P252 may send ONE internal validation email when fully configured.
  // Explicit candidate/campaign live flags are refused.
  if (
    argv.includes("--canary-only") ||
    argv.includes("--continue-full") ||
    argv.includes("--resend-paperwork")
  ) {
    console.error(
      "[p252] Refusing campaign/paperwork flags — this mission only validates mail + optional internal test send.",
    );
    process.exit(2);
  }

  loadEnvLocal();

  console.log("[p252] Production email validation starting…");
  const result = await runP252ProductionEmailValidation({
    skipUnitTests: argv.includes("--skip-unit-tests"),
  });

  console.log(formatProductionConfigDiagnostics(result.runtimeConfig));

  console.log(
    JSON.stringify(
      {
        ok: true,
        decision: result.goNoGo.decision,
        highestImpactBlocker: result.goNoGo.highestImpactBlocker,
        okForLiveEmail: result.runtimeConfig.okForLiveEmail,
        deploymentTier: result.runtimeConfig.tier,
        resendAuthenticated: result.resendProbe.authenticated,
        domainVerified: result.resendProbe.domainVerified,
        liveTestEmailSent: result.liveDelivery.sent,
        liveTestEmailRecipientRedacted: result.liveDelivery.recipientRedacted,
        liveTestSkippedReason: result.liveDelivery.skippedReason,
        remainingBlockers: result.goNoGo.remainingBlockers,
        expectedThroughput: result.goNoGo.expectedThroughput,
        estimatedReadyForMelToday: result.goNoGo.estimatedReadyForMelToday,
        expectedRecruiterTimeSavingsHours:
          result.goNoGo.expectedRecruiterTimeSavingsHours,
        unitTests: result.pipeline.unitTests.detail,
        paperworkResent: false,
        workflowStagesModified: false,
        dbCandidateUpdates: 0,
        artifacts: result.artifacts,
      },
      null,
      2,
    ),
  );

  if (result.goNoGo.decision === "NO-GO") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
