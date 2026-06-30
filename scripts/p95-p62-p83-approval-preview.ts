import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildP62P83ApprovalPreviewFromStores } from "@/lib/p62-p83-approval-preview";

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
  const report = await buildP62P83ApprovalPreviewFromStores({ mtdOnly: true });
  const outDir = path.join(process.cwd(), ".data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "p95-p62-p83-approval-preview.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        metrics: report.metrics,
        excluded: report.excluded,
        sampleApprovalTraces: report.sampleApprovalTraces.map((entry) => ({
          candidateId: entry.candidateId,
          candidateName: entry.candidateName,
          jobTitle: entry.jobTitle,
          assignedRecruiter: entry.assignedRecruiter,
          approvalStatus: entry.approvalStatus,
          postApprovalSimulation: entry.postApprovalSimulation,
        })),
        remainingBlockersBeforeLivePaperwork: report.remainingBlockersBeforeLivePaperwork,
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
