/**
 * P185.4 — Configure production gates and execute five-candidate canary only.
 * Never invents secrets. Stops before send when any gate is missing.
 * Does not release the remaining 20-candidate backlog.
 */
import { runP1854ConfigureAndCanary } from "../src/lib/p185-4-configure-production-gates-canary";
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
  // Do NOT force durable for production gate evaluation — report real adapter.
  setP185StorageTestFlags({});

  const authorizeCanary = process.argv.includes("--authorize-canary");
  const actor =
    process.env.P185_4_ACTOR?.trim() ||
    process.env.USER?.trim() ||
    "cli-operator";

  console.log("P185.4 — validate gates, final dry-run, gated canary (max 5)…");
  console.log(`Authorize canary: ${authorizeCanary}`);
  console.log(`Actor: ${actor}`);

  const result = await runP1854ConfigureAndCanary({
    authorizeCanary,
    actor,
    authorizationSource: authorizeCanary
      ? "cli:p185-4-configure-and-canary.ts --authorize-canary"
      : "cli:p185-4-configure-and-canary.ts",
  });

  // Never print secrets — gate report uses booleans only
  const publicGate = {
    ...result.gateReport,
    storage: {
      ...result.gateReport.storage,
      // keep path classification; dataDir is operational not secret
    },
  };

  console.log("\n=== P185.4 Result ===");
  console.log(JSON.stringify({
    stoppedBeforeSend: result.stoppedBeforeSend,
    environmentConfigured: result.gateReport.liveReady || result.gateReport.blockers.filter(b => !b.includes("P184")).length === 0,
    storage: {
      adapter: result.gateReport.storage.adapter,
      pathClassification: result.gateReport.storage.pathClassification,
      durable: result.gateReport.storage.durable,
      approvedForLiveSend: result.gateReport.storage.approvedForLiveSend,
      productionStorageConfirmed: result.gateReport.storage.productionStorageConfirmed,
    },
    cronSecretConfigured: result.gateReport.cronSecretConfigured,
    cronAuthProbePassed: result.gateReport.cronAuthProbePassed,
    productionAutomationEnabled: result.gateReport.productionAutomationEnabled,
    p184: result.gateReport.p184,
    dryRun: result.dryRun,
    canary: result.canary,
    remainingQueue: result.remainingQueue,
    rolloutState: result.rolloutState,
    nextAction: result.nextAction,
    blockers: result.gateReport.blockers,
    setupInstructions: result.gateReport.setupInstructions,
    configAudits: result.configAudits,
  }, null, 2));

  if (result.stoppedBeforeSend) {
    console.log("\nStopped before live sending. Complete the setup instructions above, then re-run with --authorize-canary.");
  } else {
    console.log("\nCanary cycle finished. Remaining backlog was NOT released.");
  }

  void publicGate;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
