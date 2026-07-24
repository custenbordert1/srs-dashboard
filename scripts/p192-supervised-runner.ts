/**
 * P192 Supervised Continuous Paperwork Runner — CLI
 *
 *   npm run p192:start
 *   npm run p192:status
 *   npm run p192:once
 *   npm run p192:stop
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  applyP192ProductionDropboxEnv,
  readP192Status,
  runP192Once,
  runP192Preflight,
  startP192SupervisedRunner,
  stopP192SupervisedRunner,
  restoreP192SafeModes,
} from "../src/lib/p192-supervised-paperwork-runner";
import { setP185StorageTestFlags } from "../src/lib/p185-production-paperwork-automation-runner/durableStorage";

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

const ART = path.join(process.cwd(), "artifacts");

async function writeArtifacts(input: {
  preflight?: unknown;
  validation?: unknown;
  firstCycle?: unknown;
}): Promise<void> {
  await mkdir(ART, { recursive: true });
  if (input.preflight) {
    await writeFile(
      path.join(ART, "p192-production-preflight.json"),
      `${JSON.stringify(input.preflight, null, 2)}\n`,
    );
  }
  if (input.validation) {
    await writeFile(
      path.join(ART, "p192-supervised-runner-validation.json"),
      `${JSON.stringify(input.validation, null, 2)}\n`,
    );
  }
  if (input.firstCycle) {
    await writeFile(
      path.join(ART, "p192-first-live-cycle.json"),
      `${JSON.stringify(input.firstCycle, null, 2)}\n`,
    );
  }

  const instructions = `# P192 Operating Instructions

## Commands

\`\`\`bash
npm run p192:start    # start supervised continuous runner (this machine only)
npm run p192:status   # print redacted status from .data/p192-supervised-runner-status.json
npm run p192:once     # one live cycle then restore P184 dry_run
npm run p192:stop     # request clean stop + restore P184 dry_run
\`\`\`

Ctrl+C on the start process performs the same safe shutdown.

## Behavior

- Immediate first cycle, then every **10 minutes**
- Only **Paperwork Needed** candidates with Recommend Hire + Operator Approval evidence
- Dropbox Sign **test_mode=false** (production)
- Max 10 sends/cycle, 4/min, 40/hr, 200/day, concurrency 2, max 3 failures/cycle
- Empty queue: remains running and reports eligible=0
- Never recommends, approves, creates Paperwork Needed, or exports MEL

## Stop

\`npm run p192:stop\` or Ctrl+C restores **P184 dry_run** and releases the lease/lock.
`;
  await writeFile(path.join(ART, "p192-operating-instructions.md"), instructions);

  const readiness = `# P192 Readiness Report

Generated: ${new Date().toISOString()}

See \`p192-production-preflight.json\` and \`p192-first-live-cycle.json\` for live numbers.

## Safety walls

- No recommendations
- No approvals
- No Paperwork Needed creation
- No MEL
- No P187 authority
- Single-instance lock + durable lease
- P184 returned to dry_run on stop
`;
  await writeFile(path.join(ART, "p192-readiness-report.md"), readiness);
}

async function main(): Promise<void> {
  loadEnvLocal();
  setP185StorageTestFlags({ forceDurable: true });
  applyP192ProductionDropboxEnv();

  const cmd =
    process.argv.includes("--stop") || process.argv.includes("stop")
      ? "stop"
      : process.argv.includes("--status") || process.argv.includes("status")
        ? "status"
        : process.argv.includes("--once") || process.argv.includes("once")
          ? "once"
          : process.argv.includes("--preflight") || process.argv.includes("preflight")
            ? "preflight"
            : "start";

  if (cmd === "status") {
    const status = await readP192Status();
    console.log(JSON.stringify(status ?? { phase: "stopped", detail: "no status file" }, null, 2));
    return;
  }

  if (cmd === "stop") {
    const result = await stopP192SupervisedRunner();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === "preflight") {
    const preflight = await runP192Preflight();
    await writeArtifacts({
      preflight,
      validation: {
        ok: preflight.ok,
        testMode: preflight.testMode,
        dryRun: preflight.dryRun,
        productionModeConfirmed: preflight.productionModeConfirmed,
      },
    });
    console.log(JSON.stringify(preflight, null, 2));
    if (!preflight.ok) process.exit(1);
    return;
  }

  if (cmd === "once") {
    const result = await runP192Once();
    await writeArtifacts({
      preflight: result.preflight,
      validation: {
        ok: result.preflight.ok,
        testMode: result.preflight.testMode,
        dryRun: result.preflight.dryRun,
        once: true,
      },
      firstCycle: result.cycle,
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.preflight.ok) process.exit(1);
    return;
  }

  // start (continuous)
  console.log(
    JSON.stringify(
      {
        phase: "P192",
        action: "start",
        intervalMs: 600_000,
        productionConfirmation: "operator-prompt-p192",
        testModeRequired: false,
      },
      null,
      2,
    ),
  );

  const preflight = await runP192Preflight();
  await writeArtifacts({
    preflight,
    validation: {
      ok: preflight.ok,
      testMode: preflight.testMode,
      dryRun: preflight.dryRun,
      productionModeConfirmed: preflight.productionModeConfirmed,
      gates: preflight.gates,
    },
  });

  if (!preflight.ok) {
    await restoreP192SafeModes();
    console.error(JSON.stringify({ aborted: true, preflight }, null, 2));
    process.exit(1);
  }

  const result = await startP192SupervisedRunner();
  if (result.firstCycle) {
    await writeArtifacts({
      preflight: result.preflight,
      validation: {
        ok: result.preflight.ok,
        testMode: result.preflight.testMode,
        dryRun: result.preflight.dryRun,
        started: result.started,
        reason: result.reason,
      },
      firstCycle: result.firstCycle,
    });
  }

  console.log(
    JSON.stringify(
      {
        started: result.started,
        reason: result.reason,
        ownerId: result.ownerId,
        firstCycle: result.firstCycle
          ? {
              evaluated: result.firstCycle.evaluated,
              eligible: result.firstCycle.eligible,
              attempted: result.firstCycle.attempted,
              confirmedSent: result.firstCycle.confirmedSent,
              failed: result.firstCycle.failed,
              remainingEligible: result.firstCycle.remainingEligible,
            }
          : null,
        testMode: result.preflight.testMode,
        productionModeConfirmed: result.preflight.productionModeConfirmed,
      },
      null,
      2,
    ),
  );

  if (!result.started) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await restoreP192SafeModes();
  } catch {
    // ignore
  }
  process.exit(1);
});
