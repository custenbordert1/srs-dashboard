/**
 * P105 — Auto-advance remaining test cohort + executeOne sends.
 * Usage:
 *   npx tsx scripts/p105-test-cohort-auto-advance.ts           # persist + dryRun
 *   npx tsx scripts/p105-test-cohort-auto-advance.ts --send  # persist + live executeOne
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildP105Report } from "@/lib/test-cohort-auto-advance";

function loadEnvLocal(): void {
  try {
    const envPath = path.resolve(".env.local");
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // use process env
  }
}

async function main() {
  loadEnvLocal();
  const sendLive = process.argv.includes("--send");

  console.error(`[P105] Mode: ${sendLive ? "persist + executeOne" : "persist + dryRun only"}`);

  const report = await buildP105Report({
    mtdOnly: false,
    executeSends: sendLive,
    approvedBy: "P105 Executive Auto-Advance",
    approvedByUserId: "p105-script",
  });

  const outDir = path.join(process.cwd(), ".data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "p105-test-cohort-auto-advance.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const artifactCopy = path.join(process.cwd(), "artifacts/p105-test-cohort-auto-advance.json");
  await mkdir(path.dirname(artifactCopy), { recursive: true });
  await writeFile(artifactCopy, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        metrics: report.metrics,
        persisted: report.persisted,
        diagnoses: report.diagnoses.map((d) => ({
          applicantName: d.applicantName,
          primaryReasons: d.diagnosis.primaryReasons,
        })),
        safeToSend: report.safeToSend.map((a) => ({
          applicantName: a.applicantName,
          candidateId: a.candidateId,
          email: a.email,
        })),
        blocked: report.blocked.map((a) => ({
          applicantName: a.applicantName,
          blockerReasons: a.blockerReasons,
        })),
        invalidEmail: report.invalidEmail.map((a) => a.applicantName),
        executions: report.executions,
        needingAction: report.needingAction.map((a) => ({
          applicantName: a.applicantName,
          recommendation: a.recommendation,
        })),
        artifactPaths: report.artifactPaths,
        liveSendExecuted: sendLive,
      },
      null,
      2,
    ),
  );
  console.error(`\nWrote ${outPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
