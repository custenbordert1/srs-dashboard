/**
 * P104 — Urgent paperwork send for test applicant cohort.
 * Usage:
 *   npx tsx scripts/p104-test-cohort-live-send.ts           # dryRun only (default)
 *   npx tsx scripts/p104-test-cohort-live-send.ts --send  # dryRun + executeOne per safe candidate
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildTestCohortSendReadinessFromStores,
  executeTestCohortSafeSends,
} from "@/lib/test-cohort-live-send";

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
  const readiness = await buildTestCohortSendReadinessFromStores({ mtdOnly: false });

  console.error(`[P104] Re-ran P103 validation (${readiness.p103ValidationGeneratedAt})`);
  console.error(`[P104] Safe to send now: ${readiness.metrics.safeToSendNowCount}`);
  console.error(`[P104] Mode: ${sendLive ? "dryRun + executeOne" : "dryRun only"}`);

  const report = sendLive
    ? await executeTestCohortSafeSends({
        report: readiness,
        executiveApprovalFlag: true,
        mtdOnly: false,
        dryRunOnly: false,
      })
    : await executeTestCohortSafeSends({
        report: readiness,
        mtdOnly: false,
        dryRunOnly: true,
      });

  const outDir = path.join(process.cwd(), ".data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "p104-test-cohort-live-send.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        metrics: report.metrics,
        safeToSend: report.safeToSend.map((a) => ({
          applicantName: a.applicantName,
          candidateId: a.candidateId,
          email: a.email,
        })),
        blocked: report.blocked.map((a) => ({
          applicantName: a.applicantName,
          blockerReasons: a.blockerReasons,
        })),
        invalidEmail: report.invalidEmail.map((a) => ({
          applicantName: a.applicantName,
          email: a.email,
        })),
        duplicateRisk: report.duplicateRisk.map((a) => ({
          applicantName: a.applicantName,
          detail: a.blockerReasons,
        })),
        alreadySent: report.alreadySent.map((a) => ({
          applicantName: a.applicantName,
          candidateId: a.candidateId,
        })),
        executions: report.executions,
        needingAction: report.needingAction.map((a) => ({
          applicantName: a.applicantName,
          recommendation: a.recommendation,
        })),
        applicants: report.applicants,
        artifactPath: outPath,
        liveSendExecuted: sendLive,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
