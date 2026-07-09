/**
 * P181 — Scoped operator paperwork queue validation (read-only).
 *
 * Usage: npx tsx scripts/p181-scoped-operator-paperwork-queue.ts
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildP181ScopedQueueValidationReport,
  formatP181Markdown,
} from "@/lib/p181-scoped-operator-paperwork-queue";

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

  const report = await buildP181ScopedQueueValidationReport();

  let testsPassed = false;
  try {
    execSync(
      "node --import tsx --test src/lib/p181-scoped-operator-paperwork-queue/*.test.ts",
      { stdio: "pipe" },
    );
    testsPassed = true;
  } catch {
    testsPassed = false;
  }

  const artifact = {
    ...report,
    validation: {
      testsPassed,
      noPaperworkSends: true,
      noAutomationEnabled: true,
      noBreezyWrites: true,
      noDropboxCalls: true,
      operatorNeverExpandsGlobalPool: !report.operator.wouldLeakToGlobalPool,
    },
  };

  await mkdir("artifacts", { recursive: true });
  const jsonPath = path.join("artifacts", "p181-scoped-operator-paperwork-queue.json");
  const mdPath = path.join("artifacts", "p181-scoped-operator-paperwork-queue.md");

  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(mdPath, `${formatP181Markdown(report)}\n`, "utf8");

  console.log(formatP181Markdown(report));
  console.log("");
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(`Tests: ${testsPassed ? "PASS" : "FAIL"}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
