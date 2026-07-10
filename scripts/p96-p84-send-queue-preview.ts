import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildP84SendQueuePreviewFromStores } from "@/lib/p84-send-queue-preview";

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
  const report = await buildP84SendQueuePreviewFromStores({ mtdOnly: true });
  const outDir = path.join(process.cwd(), ".data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "p96-p84-send-queue-preview.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        metrics: report.metrics,
        sampleTraces: report.sampleTraces.map((entry) => ({
          candidateId: entry.candidateId,
          candidateName: entry.candidateName,
          email: entry.email,
          recruiter: entry.recruiter,
          dm: entry.dm,
          jobTitle: entry.jobTitle,
          eligibilityResult: entry.eligibilityResult,
          sendBlockedReason: entry.sendBlockedReason,
          duplicateSendProtection: entry.duplicateSendProtection,
          liveSend: entry.liveSend,
        })),
        finalChecklistBeforeApprovalModeProduction:
          report.finalChecklistBeforeApprovalModeProduction,
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
