/**
 * P158.2 — Post-Assignment Outcome Diagnosis validation (read-only).
 *
 * Usage: npx tsx scripts/p158.2-post-assignment-outcome-diagnosis.ts
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildPostAssignmentOutcomeDiagnosis,
  formatP1582DiagnosisMarkdown,
} from "@/lib/p158-post-assignment-outcome-diagnosis";

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

  const diagnosis = await buildPostAssignmentOutcomeDiagnosis();

  let buildPassed = false;
  let p1582TestsPassed = false;
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
    execSync("node --import tsx --test src/lib/p158-post-assignment-outcome-diagnosis/*.test.ts", {
      stdio: "pipe",
    });
    p1582TestsPassed = true;
  } catch {
    p1582TestsPassed = false;
  }

  try {
    execSync("node --import tsx --test src/lib/p158-assignment-simulation/*.test.ts", {
      stdio: "pipe",
    });
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
    sourcePhase: "P158.2",
    generatedAt: new Date().toISOString(),
    validation: {
      buildPassed,
      p1582TestsPassed,
      p1581RegressionPassed,
      p158RegressionPassed,
      p157RegressionPassed,
      p156RegressionPassed,
      p155RegressionPassed,
      p154RegressionPassed,
      readOnlyDiagnosis: true,
      noRecruiterAssignmentsPerformed: true,
      noBreezyWrites: true,
      noWorkflowWrites: true,
      noPaperworkSends: true,
    },
    summary: diagnosis.summary,
    blockerCounts: diagnosis.summary.blockerCounts,
    classCounts: diagnosis.summary.classCounts,
    safestNextChange: diagnosis.summary.safestNextChange,
    candidates: diagnosis.candidates,
    diagnosis,
    warnings: diagnosis.warnings,
  };

  await mkdir("artifacts", { recursive: true });
  const jsonPath = path.join("artifacts", "p158.2-post-assignment-outcome-diagnosis.json");
  const mdPath = path.join("artifacts", "p158.2-post-assignment-outcome-diagnosis.md");
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatP1582DiagnosisMarkdown(diagnosis), "utf8");

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(
    JSON.stringify(
      {
        validation: artifact.validation,
        summary: diagnosis.summary,
        blockerCounts: diagnosis.summary.blockerCounts,
        classCounts: diagnosis.summary.classCounts,
        sampleDiagnosis: diagnosis.candidates.slice(0, 3),
      },
      null,
      2,
    ),
  );

  if (
    !buildPassed ||
    !p1582TestsPassed ||
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
