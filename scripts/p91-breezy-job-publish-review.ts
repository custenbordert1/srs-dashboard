import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildBreezyJobPublishReviewFromStores } from "@/lib/breezy-job-publish-review";

async function main() {
  const report = await buildBreezyJobPublishReviewFromStores({ mtdOnly: true });
  const outDir = path.join(process.cwd(), ".data");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "p91-breezy-job-publish-review.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        metrics: report.metrics,
        duplicateFindings: report.duplicateFindings,
        sampleEntries: report.entries.slice(0, 3),
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
