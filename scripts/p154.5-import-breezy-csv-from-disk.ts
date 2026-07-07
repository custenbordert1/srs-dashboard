/**
 * P154.5 — Import Breezy CSV from disk
 *
 * Usage: npx tsx scripts/p154.5-import-breezy-csv-from-disk.ts
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  formatP1545BreezyCsvImportMarkdown,
  importBreezyCsvFromDisk,
  P1545_DEFAULT_CSV_PATH,
  runPostCsvImportPipeline,
} from "@/lib/p154-breezy-csv-import";

const SESSION = {
  userId: "p154.5-csv-import",
  email: "p154.5@local",
  name: "P154.5 Breezy CSV Import",
  role: "executive" as const,
  territoryStates: [],
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
};

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

  const csvPath = path.resolve(process.cwd(), P1545_DEFAULT_CSV_PATH);
  console.error(`[P154.5] Loading CSV from ${csvPath}…`);

  const importReport = await importBreezyCsvFromDisk({
    csvPath,
    byUserId: SESSION.userId,
  });

  console.error("[P154.5] Running recruiter assignment + paperwork eligibility (no sends)…");
  const pipeline = await runPostCsvImportPipeline({
    session: SESSION,
    userId: SESSION.userId,
  });

  const report = { ...importReport, pipeline };

  const jsonPath = path.join(process.cwd(), "artifacts", "p154.5-import-breezy-csv-from-disk.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p154.5-import-breezy-csv-from-disk.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatP1545BreezyCsvImportMarkdown(report), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        jsonPath,
        mdPath,
        import: {
          totalRows: report.totalRows,
          imported: report.imported,
          updated: report.updated,
          skipped: report.skipped,
          duplicates: report.duplicates,
          mergedIntoStore: report.mergedIntoStore,
        },
        assignment: pipeline.assignment
          ? {
              candidatesEvaluated: pipeline.assignment.candidatesEvaluated,
              assignmentsCompleted: pipeline.assignment.assignmentsCompleted,
            }
          : null,
        paperworkEligibility: pipeline.paperworkEligibility
          ? {
              eligibleCount: pipeline.paperworkEligibility.eligibleCount,
              projectedSendCount: pipeline.paperworkEligibility.projectedSendCount,
              sentCount: pipeline.paperworkEligibility.sentCount,
            }
          : null,
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
