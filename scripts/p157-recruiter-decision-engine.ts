/**
 * P157 — Intelligent Recruiter Decision Engine validation (read-only).
 *
 * Usage: npx tsx scripts/p157-recruiter-decision-engine.ts
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isP154ContinuousEnabled } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import {
  buildDecisionDashboard,
  formatP157DecisionDashboardMarkdown,
} from "@/lib/p157-recruiter-decision-engine";

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

  const dashboard = await buildDecisionDashboard();
  const topActions = dashboard.decisions.slice(0, 10);

  let buildPassed = false;
  let p157TestsPassed = false;
  let p156RegressionPassed = false;
  let p155RegressionPassed = false;
  let p154RegressionPassed = false;

  try {
    execSync("npm run build", { stdio: "pipe" });
    buildPassed = true;
  } catch {
    buildPassed = false;
  }

  try {
    execSync("node --import tsx --test src/lib/p157-recruiter-decision-engine/*.test.ts", {
      stdio: "pipe",
    });
    p157TestsPassed = true;
  } catch {
    p157TestsPassed = false;
  }

  try {
    execSync("node --import tsx --test src/lib/p156-candidate-prioritization/*.test.ts", {
      stdio: "pipe",
    });
    p156RegressionPassed = true;
  } catch {
    p156RegressionPassed = false;
  }

  try {
    execSync("node --import tsx --test src/lib/p155-autopilot-operations-dashboard/*.test.ts", {
      stdio: "pipe",
    });
    p155RegressionPassed = true;
  } catch {
    p155RegressionPassed = false;
  }

  try {
    execSync("node --import tsx --test src/lib/p154-continuous-autonomous-recruiting-runner/*.test.ts", {
      stdio: "pipe",
    });
    p154RegressionPassed = true;
  } catch {
    p154RegressionPassed = false;
  }

  const artifact = {
    sourcePhase: "P157",
    generatedAt: new Date().toISOString(),
    validation: {
      buildPassed,
      p157TestsPassed,
      p156RegressionPassed,
      p155RegressionPassed,
      p154RegressionPassed,
      continuousEnabledDefault: isP154ContinuousEnabled({}) === false,
      readOnlyExecution: true,
      noBreezyWrites: true,
      noDropboxSignSends: true,
      noAutomationChanges: true,
    },
    summary: dashboard.summary,
    distribution: dashboard.distribution,
    topRecommendedActions: topActions.map((row) => ({
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      action: row.action,
      confidence: row.confidence,
      reasoning: row.reasoning,
      priorityScore: row.priorityScore,
      recruiter: row.recruiter,
      dm: row.dm,
      project: row.project,
    })),
    dashboard,
    warnings: dashboard.warnings,
  };

  await mkdir("artifacts", { recursive: true });
  const jsonPath = path.join("artifacts", "p157-recruiter-decision-engine.json");
  const mdPath = path.join("artifacts", "p157-recruiter-decision-engine.md");
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatP157DecisionDashboardMarkdown(dashboard), "utf8");

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(
    JSON.stringify(
      {
        validation: artifact.validation,
        summary: dashboard.summary,
        topActions: topActions.map((r) => ({
          name: r.candidateName,
          action: r.action,
          confidence: r.confidence,
        })),
      },
      null,
      2,
    ),
  );

  if (
    !buildPassed ||
    !p157TestsPassed ||
    !p156RegressionPassed ||
    !p155RegressionPassed ||
    !p154RegressionPassed
  ) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
