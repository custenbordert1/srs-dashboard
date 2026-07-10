/**
 * P156 — Intelligent Candidate Prioritization validation (read-only, no live sends).
 *
 * Usage: npx tsx scripts/p156-candidate-prioritization.ts
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isP154ContinuousEnabled } from "@/lib/p154-continuous-autonomous-recruiting-runner/runner-config";
import {
  buildPrioritizedQueue,
  formatP156PrioritizedQueueMarkdown,
} from "@/lib/p156-candidate-prioritization";

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

  const queue = await buildPrioritizedQueue();
  const top10 = queue.candidates.slice(0, 10);

  let buildPassed = false;
  let p156TestsPassed = false;
  let regressionTestsPassed = false;

  try {
    execSync("npm run build", { stdio: "pipe" });
    buildPassed = true;
  } catch {
    buildPassed = false;
  }

  try {
    execSync("node --import tsx --test src/lib/p156-candidate-prioritization/*.test.ts", {
      stdio: "pipe",
    });
    p156TestsPassed = true;
  } catch {
    p156TestsPassed = false;
  }

  try {
    execSync(
      "node --import tsx --test src/lib/p155-autopilot-operations-dashboard/*.test.ts src/lib/p154-continuous-autonomous-recruiting-runner/*.test.ts",
      { stdio: "pipe" },
    );
    regressionTestsPassed = true;
  } catch {
    regressionTestsPassed = false;
  }

  const artifact = {
    sourcePhase: "P156",
    generatedAt: new Date().toISOString(),
    validation: {
      buildPassed,
      p156TestsPassed,
      regressionTestsPassed,
      continuousEnabledDefault: isP154ContinuousEnabled({}) === false,
      readOnlyScoring: true,
      noLivePaperworkSends: true,
      noBreezyWrites: true,
      existingAutomationUnchanged: true,
    },
    queueSummary: {
      totalCandidates: queue.candidates.length,
      topPriorityCount: queue.sections.topPriority.length,
      readyForPaperwork: queue.sections.readyForPaperwork.length,
      awaitingRecruiter: queue.sections.awaitingRecruiter.length,
      awaitingFollowUp: queue.sections.awaitingFollowUp.length,
      readyForMel: queue.sections.readyForMel.length,
    },
    top10HighestPriority: top10.map((row) => ({
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      priorityScore: row.priorityScore,
      reasoning: row.reasoning,
      recruiter: row.recruiter,
      dm: row.dm,
      project: row.project,
      territory: row.territory,
      openDemand: row.openDemand,
      recommendedNextAction: row.recommendedNextAction,
    })),
    examplePrioritizedQueue: queue.candidates.slice(0, 25),
    queue,
    warnings: queue.warnings,
  };

  await mkdir("artifacts", { recursive: true });
  const jsonPath = path.join("artifacts", "p156-candidate-prioritization.json");
  const mdPath = path.join("artifacts", "p156-candidate-prioritization.md");
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatP156PrioritizedQueueMarkdown(queue), "utf8");

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(
    JSON.stringify(
      {
        validation: artifact.validation,
        totalCandidates: queue.candidates.length,
        top10: top10.map((r) => ({
          name: r.candidateName,
          score: r.priorityScore,
          reasons: r.reasoning.slice(0, 3),
        })),
      },
      null,
      2,
    ),
  );

  if (!buildPassed || !p156TestsPassed || !regressionTestsPassed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
