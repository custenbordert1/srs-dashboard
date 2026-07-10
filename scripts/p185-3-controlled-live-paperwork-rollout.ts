/**
 * P185.3 — Controlled live paperwork backlog readiness + gated canary.
 *
 * Default: freeze cohort, final dry-run, validate gates, write artifacts.
 * Live canary only when ALL gates pass AND --authorize-canary is passed.
 * Never expands beyond the frozen P185.2 cohort of 25.
 * Never sends to the 78 likely-selected candidates.
 */
import {
  buildP1853ReadinessReport,
  executeP1853Canary,
  formatP1853ReadinessMarkdown,
  runP1853FinalCohortDryRun,
  writeP1853OperatorLocalReport,
  writeP1853PublicArtifacts,
} from "../src/lib/p185-3-controlled-live-paperwork-rollout";
import { setP185StorageTestFlags } from "../src/lib/p185-production-paperwork-automation-runner";

function loadEnvLocal(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    const raw = fs.readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  setP185StorageTestFlags({ forceDurable: true });

  const authorizeCanary = process.argv.includes("--authorize-canary");
  const forceRefreeze = process.argv.includes("--force-refreeze");

  console.log("P185.3 — freezing cohort + final dry-run…");
  const dry = await runP1853FinalCohortDryRun({ forceRefreeze });
  console.log(
    `Frozen ${dry.frozenSize}; still eligible ${dry.stillEligible}; newly blocked ${dry.newlyBlocked}; queue depth ${dry.queueDepth}`,
  );

  const readiness = await buildP1853ReadinessReport({
    authorizeCanary,
    forceRefreeze: false,
  });
  const markdown = formatP1853ReadinessMarkdown(readiness);
  const artifacts = await writeP1853PublicArtifacts({ readiness, markdown });
  const operatorPath = await writeP1853OperatorLocalReport({
    readiness,
    dryRunBlocked: dry.blocked,
  });

  console.log("\n=== P185.3 Readiness ===");
  console.log(`Rollout ID: ${readiness.rolloutId}`);
  console.log(`Phase: ${readiness.rolloutPhase}`);
  console.log(`Frozen cohort: ${readiness.frozenCohortCount}`);
  console.log(`Still eligible: ${readiness.dryRun?.stillEligible}`);
  console.log(`Newly blocked: ${readiness.dryRun?.newlyBlocked}`);
  console.log(`Live ready: ${readiness.liveReady}`);
  console.log(`Canary may execute: ${readiness.canaryMayExecute}`);
  console.log(`Blockers:\n${readiness.blockers.map((b) => `  - ${b}`).join("\n") || "  (none)"}`);
  console.log(
    `Setup:\n${readiness.setupInstructions.map((s, i) => `  ${i + 1}. ${s}`).join("\n") || "  (none)"}`,
  );
  console.log(`\nArtifacts:`);
  console.log(`  ${artifacts.readinessJson}`);
  console.log(`  ${artifacts.readinessMd}`);
  console.log(`  ${artifacts.summaryJson}`);
  console.log(`  ${artifacts.reconciliationJson}`);
  console.log(`  ${operatorPath} (local only — do not commit)`);

  if (!readiness.canaryMayExecute) {
    console.log(
      "\nStopped before live sending. Complete configuration gates, enable P184 live, then re-run with --authorize-canary.",
    );
    return;
  }

  console.log("\nAll gates passed + authorize-canary — executing five-candidate canary only…");
  const canary = await executeP1853Canary({
    authorizeCanary: true,
    confirmed: true,
  });
  console.log(
    JSON.stringify(
      {
        executed: canary.executed,
        skippedReason: canary.skippedReason,
        attempted: canary.attempted,
        confirmed: canary.confirmed,
        failed: canary.failed,
        sentUnverified: canary.sentUnverified,
        passed: canary.passed,
        paused: canary.paused,
        remainingEligible: canary.remainingEligible,
      },
      null,
      2,
    ),
  );

  if (canary.passed) {
    console.log(
      "\nCanary passed. Remaining backlog (up to 20) requires separate authorized backlog cycles — not auto-released by this script.",
    );
  } else {
    console.log("\nCanary did not pass — remaining backlog held.");
  }

  // Refresh public summary after canary
  const post = await buildP1853ReadinessReport({ authorizeCanary: false });
  await writeP1853PublicArtifacts({
    readiness: post,
    markdown: formatP1853ReadinessMarkdown(post),
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
