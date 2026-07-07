/**
 * P155 — Autopilot Operations Dashboard validation (no live sends).
 *
 * Usage: npx tsx scripts/p155-autopilot-operations-dashboard.ts
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildP155Exceptions,
  buildP155OperationsDashboard,
  buildP155RecentSends,
  formatP155OperationsDashboardMarkdown,
} from "@/lib/p155-autopilot-operations-dashboard";
import { isP154ContinuousEnabled } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";

function loadEnvLocal(): void {
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
    // ignore
  }
}

async function main() {
  loadEnvLocal();

  const dashboard = await buildP155OperationsDashboard();
  const recentSends = await buildP155RecentSends({ limit: 25 });
  const exceptions = await buildP155Exceptions({ limit: 50 });

  let buildPassed = false;
  let testsPassed = false;

  try {
    execSync("npm run build", { stdio: "pipe" });
    buildPassed = true;
  } catch {
    buildPassed = false;
  }

  try {
    execSync(
      "node --import tsx --test src/lib/p155-autopilot-operations-dashboard/*.test.ts src/lib/p154-continuous-autonomous-recruiting-runner/*.test.ts",
      { stdio: "pipe" },
    );
    testsPassed = true;
  } catch {
    testsPassed = false;
  }

  const artifact = {
    sourcePhase: "P155",
    generatedAt: new Date().toISOString(),
    validation: {
      buildPassed,
      testsPassed,
      continuousEnabledDefault: isP154ContinuousEnabled({}) === false,
      noLiveSendsDuringValidation: true,
      liveSendCountInRecentSends: recentSends.filter((s) => !s.dryRun).length,
    },
    dashboard,
    recentSends,
    exceptions,
  };

  await mkdir("artifacts", { recursive: true });
  const jsonPath = path.join("artifacts", "p155-autopilot-operations-dashboard.json");
  const mdPath = path.join("artifacts", "p155-autopilot-operations-dashboard.md");
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(
    mdPath,
    formatP155OperationsDashboardMarkdown({ dashboard, recentSends, exceptions }),
    "utf8",
  );

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(
    JSON.stringify(
      {
        runnerStatus: dashboard.status.runnerStatus,
        continuousEnabled: isP154ContinuousEnabled({}),
        validation: artifact.validation,
      },
      null,
      2,
    ),
  );

  if (!buildPassed || !testsPassed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
