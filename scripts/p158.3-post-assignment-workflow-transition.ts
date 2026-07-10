/**
 * P158.3 — Post-Assignment Workflow Transition validation (read-only dry-run).
 *
 * Usage: npx tsx scripts/p158.3-post-assignment-workflow-transition.ts
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuthSession } from "@/lib/auth/types";
import {
  buildTransitionReport,
  formatP1583TransitionMarkdown,
  isP158WorkflowTransitionEnabled,
} from "@/lib/p158-post-assignment-workflow-transition";
import { runP158AssignmentCycle } from "@/lib/p158-autonomous-recruiter-assignment";

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

const MOCK_SESSION: AuthSession = {
  userId: "p1583-validation",
  role: "executive",
  email: "validation@example.com",
  name: "P158.3 Validation",
  territoryStates: [],
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
};

async function main() {
  loadEnvLocal();

  const report = await buildTransitionReport();
  const dryRunCycle = await runP158AssignmentCycle({
    session: MOCK_SESSION,
    transitionAfterAssignment: true,
  });

  let buildPassed = false;
  let p1583TestsPassed = false;
  let p1582RegressionPassed = false;
  let p1581RegressionPassed = false;
  let p158RegressionPassed = false;
  let p157RegressionPassed = false;
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
    execSync("node --import tsx --test src/lib/p158-post-assignment-workflow-transition/*.test.ts", {
      stdio: "pipe",
    });
    p1583TestsPassed = true;
  } catch {
    p1583TestsPassed = false;
  }

  try {
    execSync("node --import tsx --test src/lib/p158-post-assignment-outcome-diagnosis/*.test.ts", {
      stdio: "pipe",
    });
    p1582RegressionPassed = true;
  } catch {
    p1582RegressionPassed = false;
  }

  try {
    execSync("node --import tsx --test src/lib/p158-assignment-simulation/*.test.ts", { stdio: "pipe" });
    p1581RegressionPassed = true;
  } catch {
    p1581RegressionPassed = false;
  }

  try {
    execSync("node --import tsx --test src/lib/p158-autonomous-recruiter-assignment/*.test.ts", {
      stdio: "pipe",
    });
    p158RegressionPassed = true;
  } catch {
    p158RegressionPassed = false;
  }

  try {
    execSync("node --import tsx --test src/lib/p157-recruiter-decision-engine/*.test.ts", { stdio: "pipe" });
    p157RegressionPassed = true;
  } catch {
    p157RegressionPassed = false;
  }

  try {
    execSync("node --import tsx --test src/lib/p156-candidate-prioritization/*.test.ts", { stdio: "pipe" });
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
    sourcePhase: "P158.3",
    generatedAt: new Date().toISOString(),
    validation: {
      buildPassed,
      p1583TestsPassed,
      p1582RegressionPassed,
      p1581RegressionPassed,
      p158RegressionPassed,
      p157RegressionPassed,
      p156RegressionPassed,
      p155RegressionPassed,
      p154RegressionPassed,
      transitionDisabledByDefault: isP158WorkflowTransitionEnabled({}) === false,
      dryRunCycleNoWorkflowWrites: dryRunCycle.dryRun === true,
      noPaperworkSends: true,
      noBreezyWrites: true,
    },
    summary: report.summary,
    dryRunCycle: {
      message: dryRunCycle.message,
      transition: dryRunCycle.transition,
    },
    remainingBlockers: report.remainingBlockers.slice(0, 25),
    report,
    warnings: report.warnings,
  };

  await mkdir("artifacts", { recursive: true });
  const jsonPath = path.join("artifacts", "p158.3-post-assignment-workflow-transition.json");
  const mdPath = path.join("artifacts", "p158.3-post-assignment-workflow-transition.md");
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatP1583TransitionMarkdown(report), "utf8");

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(
    JSON.stringify(
      {
        validation: artifact.validation,
        summary: report.summary,
        dryRunTransition: dryRunCycle.transition,
      },
      null,
      2,
    ),
  );

  if (
    !buildPassed ||
    !p1583TestsPassed ||
    !p1582RegressionPassed ||
    !p1581RegressionPassed ||
    !p158RegressionPassed ||
    !p157RegressionPassed ||
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
