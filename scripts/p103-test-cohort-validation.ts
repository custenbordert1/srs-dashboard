/**
 * P103 — Applicant test cohort validation.
 * Usage: npx tsx scripts/p103-test-cohort-validation.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildTestCohortValidationFromStores } from "@/lib/test-cohort-validation";

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
  const report = await buildTestCohortValidationFromStores({ mtdOnly: false });
  const outDir = path.join(process.cwd(), ".data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "p103-test-cohort-validation.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        metrics: report.metrics,
        clusters: report.clusters,
        safetyConfirmation: report.safetyConfirmation,
        applicants: report.applicants.map((entry) => ({
          applicantKey: entry.applicantKey,
          applicantName: entry.applicantName,
          matchStatus: entry.matchStatus,
          candidateId: entry.candidateId,
          positionId: entry.positionId,
          duplicateStatus: entry.duplicateStatus,
          contact: entry.contact,
          workflowStatus: entry.workflowStatus,
          actionType: entry.actionType,
          recruiter: entry.recruiter,
          dm: entry.dm,
          p84Eligible: entry.p84?.eligible ?? false,
          p100InSendQueue: entry.p100DryRun?.inSendQueue ?? false,
          paperworkSendEligible: entry.paperworkSendEligible,
          blockerReason: entry.blockerReason,
          recommendation: entry.recommendation,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`\nWrote ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
