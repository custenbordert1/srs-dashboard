/**
 * P175 — Breezy Export Import Candidate Source
 *
 * Usage:
 *   npx tsx scripts/p175-breezy-export-import.ts              # dry-run
 *   npx tsx scripts/p175-breezy-export-import.ts --confirmImport
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadDecisionCohort } from "@/lib/p157-recruiter-decision-engine/load-decision-cohort";
import { findInIngestionStore } from "@/lib/p170-unified-candidate-discovery/search-candidates";
import { parseP170SearchQuery } from "@/lib/p170-unified-candidate-discovery/parse-search-query";
import { readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { loadP171LifecycleState } from "@/lib/p171-autonomous-candidate-lifecycle-manager/lifecycle-store";
import { formatP175Markdown } from "@/lib/p175-breezy-export-import/format-report";
import { runBreezyExportImport } from "@/lib/p175-breezy-export-import/execute-export-import";

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
  const confirmImport =
    process.argv.includes("--confirmImport") || process.argv.includes("--confirmImport=true");

  const result = await runBreezyExportImport({
    confirmImport,
    byUserId: "p175-breezy-export-import-script",
  });

  const store = await readIngestionStore();
  const [p157, p171] = await Promise.all([loadDecisionCohort(), loadP171LifecycleState()]);

  const postValidation = {
    ingestionCount: Object.keys(store.candidates).length,
    p170PatriciaIrby: Boolean(findInIngestionStore(store, parseP170SearchQuery("Irby"))),
    p157CohortSize: p157.candidates.length,
    p171Tracked: Object.keys(p171.candidates).length,
    july9InP170: result.spotlight.july9Applicants.filter((r) => r.discoverableAfter).length,
    july9Total: result.spotlight.july9Applicants.length,
  };

  const artifact = {
    ...result,
    postValidation,
  };

  const jsonPath = path.join(process.cwd(), "artifacts", "p175-breezy-export-import.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p175-breezy-export-import.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatP175Markdown(artifact), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        imported: result.imported,
        dryRun: !confirmImport,
        wouldAdd: result.wouldAdd,
        wouldMerge: result.wouldMerge,
        postValidation,
        jsonPath,
        mdPath,
        rollbackPath: result.rollbackPath,
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
