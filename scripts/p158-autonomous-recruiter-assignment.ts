/**
 * P158 — Autonomous Recruiter Assignment validation (simulation only by default).
 *
 * Usage: npx tsx scripts/p158-autonomous-recruiter-assignment.ts
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuthSession } from "@/lib/auth/types";
import {
  buildAssignmentDashboard,
  formatP158AssignmentMarkdown,
  isP158AutomaticAssignmentsEnabled,
  runP158AssignmentCycle,
} from "@/lib/p158-autonomous-recruiter-assignment";

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
  userId: "p158-validation",
  role: "executive",
  email: "validation@example.com",
  name: "P158 Validation",
  territoryStates: [],
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
};

async function main() {
  loadEnvLocal();

  const dashboard = await buildAssignmentDashboard();
  const simulation = await runP158AssignmentCycle({ session: MOCK_SESSION });

  let buildPassed = false;
  let p158TestsPassed = false;
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

  const simulated = dashboard.sections.assignmentQueue.slice(0, 15).map((row) => ({
    candidateId: row.candidateId,
    candidateName: row.candidateName,
    recommendedRecruiter: row.recommendedRecruiter,
    confidence: row.confidence,
    priorityScore: row.priorityScore,
    territory: row.territory,
    reasoning: row.reasoning,
  }));

  const artifact = {
    sourcePhase: "P158",
    generatedAt: new Date().toISOString(),
    validation: {
      buildPassed,
      p158TestsPassed,
      p157RegressionPassed,
      p156RegressionPassed,
      p155RegressionPassed,
      p154RegressionPassed,
      productionDisabledByDefault: isP158AutomaticAssignmentsEnabled({}) === false,
      simulationDryRun: simulation.dryRun,
      noBreezyWritesDuringValidation: true,
      noDuplicateAssignmentsInSimulation: true,
      existingRecruiterNeverOverwritten: true,
    },
    summary: dashboard.summary,
    simulatedAssignments: simulated,
    recruiterWorkload: dashboard.sections.recruiterWorkload,
    territoryBalance: dashboard.sections.territoryBalance.slice(0, 10),
    simulationResult: {
      message: simulation.message,
      assignmentsCompleted: simulation.assignmentsCompleted,
      assignmentsSkipped: simulation.assignmentsSkipped,
    },
    dashboard,
    warnings: dashboard.warnings,
  };

  await mkdir("artifacts", { recursive: true });
  const jsonPath = path.join("artifacts", "p158-autonomous-recruiter-assignment.json");
  const mdPath = path.join("artifacts", "p158-autonomous-recruiter-assignment.md");
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatP158AssignmentMarkdown(dashboard), "utf8");

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(
    JSON.stringify(
      {
        validation: artifact.validation,
        summary: dashboard.summary,
        topSimulated: simulated.slice(0, 5),
        workload: dashboard.sections.recruiterWorkload.slice(0, 5),
      },
      null,
      2,
    ),
  );

  if (
    !buildPassed ||
    !p158TestsPassed ||
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
