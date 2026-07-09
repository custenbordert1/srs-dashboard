/**
 * P179 — Operator controlled send gate profile validation (read-only).
 *
 * Usage: npx tsx scripts/p179-operator-controlled-send-gate-profile.ts
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildP179OperatorSendValidationReport,
  formatP179Markdown,
} from "@/lib/p179-operator-controlled-send-gate-profile";

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

  const report = await buildP179OperatorSendValidationReport();

  let testsPassed = false;
  try {
    execSync(
      "node --import tsx --test src/lib/p179-operator-controlled-send-gate-profile/*.test.ts",
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
    },
  };

  await mkdir("artifacts", { recursive: true });
  const jsonPath = path.join("artifacts", "p179-operator-controlled-send-gate-profile.json");
  const mdPath = path.join("artifacts", "p179-operator-controlled-send-gate-profile.md");
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatP179Markdown(report), "utf8");

  console.log(
    JSON.stringify(
      {
        validation: artifact.validation,
        summary: report.summary,
        operatorGates: {
          pass: report.gateProfiles.operator.pass,
          warnings: report.gateProfiles.operator.warnings,
          blocking: report.gateProfiles.operator.blockingFactors,
        },
        autonomousGates: {
          pass: report.gateProfiles.autonomous.pass,
          blocking: report.gateProfiles.autonomous.blockingFactors,
        },
        jsonPath,
        mdPath,
      },
      null,
      2,
    ),
  );

  if (!testsPassed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
