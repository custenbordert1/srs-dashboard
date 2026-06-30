import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildPaperworkEligibilityReconciliationFromStores } from "@/lib/paperwork-eligibility-reconciliation";

async function main() {
  const report = await buildPaperworkEligibilityReconciliationFromStores({ mtdOnly: true });
  const outDir = path.join(process.cwd(), ".data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "p88-paperwork-eligibility-reconciliation.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        summary: report.summary,
        blockerBreakdown: report.blockerBreakdown,
        ruleAlignment: report.ruleAlignment,
        remainingBlockersBeforeLiveSend: report.remainingBlockersBeforeLiveSend,
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
