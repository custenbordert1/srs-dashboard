import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildBreezyJobStatusReconciliationFromStores } from "@/lib/breezy-job-status-reconciliation";

async function main() {
  const report = await buildBreezyJobStatusReconciliationFromStores({ mtdOnly: true });
  const outDir = path.join(process.cwd(), ".data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "p92-breezy-job-status-reconciliation.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        metrics: report.metrics,
        statusCounts: report.metrics.statusCounts,
        duplicateFindings: report.duplicateFindings,
        manualActionListSample: report.manualActionList.slice(0, 5),
        candidatesUnlockedIfApproved: report.metrics.candidatesUnlockedIfApproved,
        remainingBlockersBeforeP84Unlock: report.remainingBlockersBeforeP84Unlock,
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
