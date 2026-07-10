/**
 * P174.1 follow-up — two complete re-scan passes after full position cycle.
 */
import { readFileSync } from "node:fs";
import { runCandidateIngestionSync } from "@/lib/candidate-ingestion/run-ingestion-sync";
import { listIngestedCandidates, readIngestionStore } from "@/lib/candidate-ingestion/ingestion-store";
import { findInIngestionStore } from "@/lib/p170-unified-candidate-discovery/search-candidates";
import { parseP170SearchQuery } from "@/lib/p170-unified-candidate-discovery/parse-search-query";
import * as XLSX from "xlsx";
import path from "node:path";

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
  const wb = XLSX.readFile(path.join(process.cwd(), "diagnostics", "Breezy Info.xlsx"));
  const exportEmails = XLSX.utils
    .sheet_to_json<Record<string, unknown>>(wb.Sheets["Breezy Applicants"] ?? {}, { defval: "" })
    .map((r) => String(r.email_address ?? "").trim().toLowerCase())
    .filter(Boolean);

  const before = await readIngestionStore();
  const beforeCount = listIngestedCandidates(before).length;
  let beforeMatches = 0;
  for (const email of exportEmails) {
    if (findInIngestionStore(before, parseP170SearchQuery(email))) beforeMatches += 1;
  }

  console.error(`[P174.1 rescan] Before: ${beforeCount} ingested, ${beforeMatches}/${exportEmails.length} export matches`);

  for (let pass = 1; pass <= 2; pass += 1) {
    const start = Date.now();
    const result = await runCandidateIngestionSync({
      completeCycle: true,
      runPipeline: false,
      enrichQuestionnaires: false,
      collectChunkTelemetry: true,
      maxRuntimeMs: 115_000,
      maxPositionsPerChunk: 25,
      byUserId: `p174.1-rescan-pass-${pass}`,
    });
    const store = await readIngestionStore();
    const count = listIngestedCandidates(store).length;
    let matches = 0;
    for (const email of exportEmails) {
      if (findInIngestionStore(store, parseP170SearchQuery(email))) matches += 1;
    }
    const chunkSummary = (result.chunkRecords ?? []).map((c) => ({
      chunk: c.chunkNumber,
      pos: c.positionsScanned,
      new: c.candidatesNew,
      retrieved: c.candidatesRetrieved,
      ms: c.elapsedMs,
      paginationIncomplete: c.positionPaginationIncomplete,
      failed: c.positionFetchFailed,
      timeout: c.positionScanTimedOut,
    }));
    console.error(
      JSON.stringify(
        {
          pass,
          elapsedMs: Date.now() - start,
          newCandidates: result.newCandidates,
          totalCandidates: count,
          exportMatches: matches,
          cycleComplete: result.cycleComplete,
          chunks: chunkSummary,
        },
        null,
        2,
      ),
    );
  }

  const after = await readIngestionStore();
  const afterCount = listIngestedCandidates(after).length;
  let afterMatches = 0;
  for (const email of exportEmails) {
    if (findInIngestionStore(after, parseP170SearchQuery(email))) afterMatches += 1;
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        beforeIngested: beforeCount,
        afterIngested: afterCount,
        deltaIngested: afterCount - beforeCount,
        beforeExportMatches: beforeMatches,
        afterExportMatches: afterMatches,
        deltaExportMatches: afterMatches - beforeMatches,
        stalled: afterCount === beforeCount && afterMatches === beforeMatches,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
