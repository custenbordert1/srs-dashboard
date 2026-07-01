/**
 * P121 — Executive Page Loading & Navigation Fix
 * Usage: npx tsx scripts/p121-executive-page-loading-navigation-fix.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildP121Report } from "@/lib/p121-executive-page-loading-navigation-fix";

async function main() {
  const report = buildP121Report();
  const artifactDir = path.join(process.cwd(), "artifacts");
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, "p121-executive-page-loading-navigation-fix.json");
  await writeFile(artifactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifactPath,
        tabsAudited: report.tabsAudited.length,
        fixesApplied: report.fixesApplied.length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
