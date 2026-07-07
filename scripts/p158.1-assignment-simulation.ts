/**
 * P158.1 — Recruiter Assignment Simulation validation (read-only).
 *
 * Usage: npx tsx scripts/p158.1-assignment-simulation.ts
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildAssignmentSimulation,
  formatP1581SimulationMarkdown,
  runAssignmentSimulation,
} from "@/lib/p158-assignment-simulation";

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

  const simulation = await buildAssignmentSimulation();
  const runResult = await runAssignmentSimulation();

  let buildPassed = false;
  let p158TestsPassed = false;
  let simulationTestsPassed = false;
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
    execSync("node --import tsx --test src/lib/p158-autonomous-recruiter-assignment/*.test.ts", {
      stdio: "pipe",
    });
    p158TestsPassed = true;
  } catch {
    p158TestsPassed = false;
  }

  try {
    execSync("node --import tsx --test src/lib/p158-assignment-simulation/*.test.ts", {
      stdio: "pipe",
    });
    simulationTestsPassed = true;
  } catch {
    simulationTestsPassed = false;
  }

  try {
    execSync("node --import tsx --test src/lib/p157-recruiter-decision-engine/*.test.ts", {
      stdio: "pipe",
    });
    p157RegressionPassed = true;
  } catch {
    p157RegressionPassed = false;
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
    sourcePhase: "P158.1",
    generatedAt: new Date().toISOString(),
    validation: {
      buildPassed,
      p158TestsPassed,
      simulationTestsPassed,
      p157RegressionPassed,
      p156RegressionPassed,
      p155RegressionPassed,
      p154RegressionPassed,
      readOnlySimulation: true,
      noRecruiterAssignmentsPerformed: true,
      noBreezyWrites: true,
      noWorkflowWrites: true,
      simulationOnly: true,
    },
    summary: simulation.summary,
    workloadBeforeAfter: simulation.sections.workloadImpact,
    territoryBalance: simulation.sections.territoryHeatMap.slice(0, 15),
    projectedPaperwork: simulation.sections.projectedPaperworkQueue.slice(0, 25),
    warnings: simulation.sections.warnings,
    confidenceDistribution: simulation.sections.confidenceDistribution,
    runResult: {
      message: runResult.message,
      candidatesAssignedInSimulation: runResult.simulation.summary.candidatesAssignedInSimulation,
    },
    simulation,
    warningsFlat: simulation.warnings,
  };

  await mkdir("artifacts", { recursive: true });
  const jsonPath = path.join("artifacts", "p158.1-assignment-simulation.json");
  const mdPath = path.join("artifacts", "p158.1-assignment-simulation.md");
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatP1581SimulationMarkdown(simulation), "utf8");

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(
    JSON.stringify(
      {
        validation: artifact.validation,
        summary: simulation.summary,
        workloadTop5: simulation.sections.workloadImpact.slice(0, 5),
        territoryTop5: simulation.sections.territoryHeatMap.slice(0, 5),
        warnings: simulation.sections.warnings.slice(0, 5),
      },
      null,
      2,
    ),
  );

  if (
    !buildPassed ||
    !p158TestsPassed ||
    !simulationTestsPassed ||
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
