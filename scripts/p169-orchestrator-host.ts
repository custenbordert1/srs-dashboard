/**
 * P169 host process — optional background interval runner.
 * Does NOT enable P154 continuous mode or daemon.
 *
 * Usage:
 *   P169_ORCHESTRATOR_ENABLED=true npx tsx scripts/p169-orchestrator-host.ts
 */
import { readFileSync } from "node:fs";
import {
  isP169OrchestratorEnabled,
  resolveP169EnvConfig,
} from "../src/lib/p169-autonomous-recruiting-orchestrator/orchestrator-config.ts";
import { runP169OrchestratorCycle } from "../src/lib/p169-autonomous-recruiting-orchestrator/run-orchestrator-cycle.ts";

function loadEnvLocal() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[t.slice(0, eq).trim()] = v;
    }
  } catch {
    /* optional */
  }
}

loadEnvLocal();

const systemSession = {
  userId: "p169-orchestrator-host",
  email: "orchestrator@system.local",
  role: "executive" as const,
  name: "P169 Orchestrator",
  territoryStates: [] as string[],
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
};

async function tick() {
  if (!isP169OrchestratorEnabled()) {
    console.log("[P169] Orchestrator disabled — sleeping");
    return;
  }
  console.log(`[P169] Cycle start ${new Date().toISOString()}`);
  const result = await runP169OrchestratorCycle({ session: systemSession });
  console.log(
    `[P169] Cycle ${result.cycle.status} — evaluated ${result.cycle.candidatesEvaluated}, sent ${result.cycle.candidatesSent}`,
  );
  if (result.warnings.length > 0) {
    for (const w of result.warnings) console.warn(`[P169] ${w}`);
  }
}

async function main() {
  const config = resolveP169EnvConfig();
  if (!config.enabled) {
    console.error("P169_ORCHESTRATOR_ENABLED is not true — host exiting without starting interval.");
    process.exit(1);
  }

  console.log(
    `[P169] Host started — interval ${Math.round(config.cycleIntervalMs / 60_000)} minutes (no P154 daemon)`,
  );

  await tick();
  setInterval(() => {
    void tick();
  }, config.cycleIntervalMs);
}

void main();
