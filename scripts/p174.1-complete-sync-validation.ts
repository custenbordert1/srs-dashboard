/**
 * P174.1 — Complete Breezy synchronization validation
 *
 * Runs ingestion until full parity, stall, or safety cap.
 * Usage: npx tsx scripts/p174.1-complete-sync-validation.ts
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { fetchBreezyCandidates } from "@/lib/breezy-api";
import { runCandidateIngestionSync } from "@/lib/candidate-ingestion/run-ingestion-sync";
import {
  listIngestedCandidates,
  readIngestionStore,
} from "@/lib/candidate-ingestion/ingestion-store";
import { findInIngestionStore } from "@/lib/p170-unified-candidate-discovery/search-candidates";
import { parseP170SearchQuery } from "@/lib/p170-unified-candidate-discovery/parse-search-query";
import { loadDecisionCohort } from "@/lib/p157-recruiter-decision-engine/load-decision-cohort";
import { loadP171LifecycleState } from "@/lib/p171-autonomous-candidate-lifecycle-manager/lifecycle-store";
import type { CandidateIngestionChunkRecord } from "@/lib/candidate-ingestion/types";

const WORKBOOK = path.join(process.cwd(), "diagnostics", "Breezy Info.xlsx");
const MAX_INVOCATIONS = 30;
const EXPORT_TARGET = 367;

type ExportRow = {
  name: string;
  email: string;
  appliedAt: string;
  positionName: string;
};

type CoverageSnapshot = {
  at: string;
  invocation: number;
  positionsScanned: number;
  positionsTotal: number;
  positionCoveragePct: number;
  candidatesIngested: number;
  exportIngestionMatches: number;
  exportCoveragePct: number;
  apiPreviewCount: number;
  apiFastCount: number;
  p170StoreHits: number;
  p157CohortSize: number;
  p171Tracked: number;
  cycleComplete: boolean;
  newestJuly9InIngestion: number;
  newestJuly8InIngestion: number;
  newestJuly7InIngestion: number;
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

function excelDateToIso(serial: number, timeFrac = 0): string {
  if (!serial || !Number.isFinite(serial)) return "";
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  if (timeFrac) {
    const secs = Math.round(timeFrac * 86400);
    d.setUTCHours(0, 0, 0, 0);
    d.setTime(d.getTime() + secs * 1000);
  }
  return d.toISOString();
}

function loadExport(): ExportRow[] {
  const wb = XLSX.readFile(WORKBOOK);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.Sheets["Breezy Applicants"] ?? {},
    { defval: "" },
  );
  return rows
    .map((r) => {
      const addedDate = Number(r.addedDate ?? 0);
      const addedTime = Number(r.addedTime ?? 0);
      return {
        name: String(r.name ?? ""),
        email: String(r.email_address ?? "").trim().toLowerCase(),
        appliedAt: excelDateToIso(addedDate, addedTime),
        positionName: String(r.position ?? ""),
      };
    })
    .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
}

function countExportInIngestion(exportRows: ExportRow[], store: Awaited<ReturnType<typeof readIngestionStore>>): number {
  let hits = 0;
  for (const row of exportRows) {
    if (!row.email) continue;
    if (findInIngestionStore(store, parseP170SearchQuery(row.email))) hits += 1;
  }
  return hits;
}

function countByDatePrefix(exportRows: ExportRow[], store: Awaited<ReturnType<typeof readIngestionStore>>, prefix: string): number {
  const subset = exportRows.filter((r) => r.appliedAt.startsWith(prefix));
  return countExportInIngestion(subset, store);
}

async function buildCoverageSnapshot(input: {
  invocation: number;
  exportRows: ExportRow[];
  includeLiveApi: boolean;
}): Promise<CoverageSnapshot> {
  const store = await readIngestionStore();
  const ingested = listIngestedCandidates(store);
  const exportMatches = countExportInIngestion(input.exportRows, store);

  let apiPreviewCount = 0;
  let apiFastCount = 0;
  if (input.includeLiveApi) {
    const [preview, fast] = await Promise.all([
      fetchBreezyCandidates({ scanMode: "preview", force: true }),
      fetchBreezyCandidates({ scanMode: "fast", force: true }),
    ]);
    apiPreviewCount = preview.ok ? preview.candidates.length : 0;
    apiFastCount = fast.ok ? fast.candidates.length : 0;
  }

  const [p157, p171] = await Promise.all([loadDecisionCohort(), loadP171LifecycleState()]);
  let p170StoreHits = 0;
  for (const row of input.exportRows) {
    if (row.email && findInIngestionStore(store, parseP170SearchQuery(row.email))) {
      p170StoreHits += 1;
    }
  }

  const scanned = new Set(store.scannedPositionIds).size;
  const total = store.publishedPositionsTotal;

  return {
    at: new Date().toISOString(),
    invocation: input.invocation,
    positionsScanned: scanned,
    positionsTotal: total,
    positionCoveragePct: total > 0 ? Math.round((scanned / total) * 100) : 0,
    candidatesIngested: ingested.length,
    exportIngestionMatches: exportMatches,
    exportCoveragePct: Math.round((exportMatches / input.exportRows.length) * 100),
    apiPreviewCount,
    apiFastCount,
    p170StoreHits,
    p157CohortSize: p157.candidates.length,
    p171Tracked: Object.keys(p171.candidates).length,
    cycleComplete: store.cycleComplete,
    newestJuly9InIngestion: countByDatePrefix(input.exportRows, store, "2026-07-09"),
    newestJuly8InIngestion: countByDatePrefix(input.exportRows, store, "2026-07-08"),
    newestJuly7InIngestion: countByDatePrefix(input.exportRows, store, "2026-07-07"),
  };
}

async function main() {
  loadEnvLocal();
  const startedAt = Date.now();
  const exportRows = loadExport();
  const exportTarget = exportRows.length;

  console.error(`[P174.1] Export baseline: ${exportTarget} candidates`);
  console.error("[P174.1] Starting measured ingestion completion run…");

  const coverageAfterInvocations: CoverageSnapshot[] = [];
  const allChunkRecords: Array<CandidateIngestionChunkRecord & { invocation: number }> = [];
  const invocationSummaries: Array<Record<string, unknown>> = [];

  let invocation = 0;
  let stallPasses = 0;
  let previousIngested = 0;
  let previousScanned = 0;
  let stopReason = "max_invocations";
  let fullParityAchieved = false;
  let engineReaches100Pct: "yes" | "no" | "inconclusive" = "inconclusive";

  const baseline = await buildCoverageSnapshot({
    invocation: 0,
    exportRows,
    includeLiveApi: true,
  });
  coverageAfterInvocations.push(baseline);
  previousIngested = baseline.candidatesIngested;
  previousScanned = baseline.positionsScanned;

  while (invocation < MAX_INVOCATIONS) {
    invocation += 1;
    const invStart = Date.now();
    console.error(`[P174.1] Invocation ${invocation}/${MAX_INVOCATIONS} — completeCycle sync…`);

    const result = await runCandidateIngestionSync({
      completeCycle: true,
      runPipeline: false,
      enrichQuestionnaires: false,
      collectChunkTelemetry: true,
      maxRuntimeMs: 115_000,
      maxPositionsPerChunk: 25,
      byUserId: "p174.1-complete-sync-validation",
    });

    if (result.chunkRecords) {
      for (const chunk of result.chunkRecords) {
        allChunkRecords.push({ ...chunk, invocation });
        console.error(
          `[P174.1]   chunk ${chunk.chunkNumber}: +${chunk.positionsScanned} pos, +${chunk.candidatesNew} new, ` +
            `${chunk.candidatesRetrieved} retrieved, ${chunk.elapsedMs}ms, ` +
            `failed=${chunk.positionFetchFailed} timeout=${chunk.positionScanTimedOut} truncated=${chunk.truncated}`,
        );
      }
    }

    const snapshot = await buildCoverageSnapshot({
      invocation,
      exportRows,
      includeLiveApi: invocation % 3 === 0 || result.cycleComplete,
    });
    coverageAfterInvocations.push(snapshot);

    invocationSummaries.push({
      invocation,
      elapsedMs: Date.now() - invStart,
      ok: result.ok,
      error: result.error ?? null,
      chunksProcessed: result.chunksProcessed,
      positionsScannedThisRun: result.positionsScannedThisRun,
      newCandidates: result.newCandidates,
      totalCandidates: result.totalCandidates,
      scannedPositions: result.scannedPositions,
      positionCoveragePct: result.positionCoveragePct,
      cycleComplete: result.cycleComplete,
      snapshot,
    });

    console.error(
      `[P174.1] After invocation ${invocation}: ` +
        `positions ${snapshot.positionsScanned}/${snapshot.positionsTotal} (${snapshot.positionCoveragePct}%), ` +
        `ingested ${snapshot.candidatesIngested}, export match ${snapshot.exportIngestionMatches}/${exportTarget} (${snapshot.exportCoveragePct}%)`,
    );

    const positionsDone = snapshot.positionsScanned >= snapshot.positionsTotal && snapshot.positionsTotal > 0;
    const candidatesDone = snapshot.exportIngestionMatches >= exportTarget;
    const noProgress =
      snapshot.candidatesIngested === previousIngested && snapshot.positionsScanned === previousScanned;

    if (positionsDone && candidatesDone) {
      stopReason = "full_parity_positions_and_export_matches";
      fullParityAchieved = true;
      engineReaches100Pct = "yes";
      break;
    }

    if (candidatesDone) {
      stopReason = "all_export_candidates_ingested";
      fullParityAchieved = true;
      engineReaches100Pct = "yes";
      break;
    }

    if (positionsDone) {
      // Completion criterion #3: require two full passes with no new candidates after all positions scanned.
      if (noProgress) {
        stallPasses += 1;
        if (stallPasses >= 2) {
          stopReason = "all_positions_scanned_no_new_candidates_two_passes";
          engineReaches100Pct = snapshot.exportIngestionMatches >= exportTarget * 0.95 ? "yes" : "no";
          break;
        }
      } else {
        stallPasses = 0;
      }
      previousIngested = snapshot.candidatesIngested;
      previousScanned = snapshot.positionsScanned;
      if (!result.ok) {
        stopReason = `sync_error: ${result.error ?? "unknown"}`;
        engineReaches100Pct = "no";
        break;
      }
      continue;
    }

    if (noProgress) {
      stallPasses += 1;
      if (stallPasses >= 2) {
        stopReason = "no_progress_after_two_invocations";
        engineReaches100Pct = "no";
        break;
      }
    } else {
      stallPasses = 0;
    }

    previousIngested = snapshot.candidatesIngested;
    previousScanned = snapshot.positionsScanned;

    if (!result.ok) {
      stopReason = `sync_error: ${result.error ?? "unknown"}`;
      engineReaches100Pct = "no";
      break;
    }
  }

  const finalSnapshot = coverageAfterInvocations[coverageAfterInvocations.length - 1]!;
  const remainingPositions = finalSnapshot.positionsTotal - finalSnapshot.positionsScanned;
  const remainingCandidates = exportTarget - finalSnapshot.exportIngestionMatches;
  const chunksRemaining = Math.ceil(remainingPositions / 25);
  const estimatedMinutesRemaining = chunksRemaining * 2;

  const finalStore = await readIngestionStore();
  const missingExport = exportRows
    .filter((r) => r.email && !findInIngestionStore(finalStore, parseP170SearchQuery(r.email)))
    .slice(0, 50)
    .map((r) => ({
      name: r.name,
      email: r.email,
      appliedAt: r.appliedAt,
      position: r.positionName,
    }));

  const stallAnalysis = analyzeStall(allChunkRecords, finalSnapshot, stopReason);

  const report = {
    sourcePhase: "P174.1",
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    stopReason,
    fullParityAchieved,
    engineReaches100PctWithoutAdditionalCode: engineReaches100Pct,
    exportTarget,
    final: {
      positionCoveragePct: finalSnapshot.positionCoveragePct,
      positionsScanned: finalSnapshot.positionsScanned,
      positionsTotal: finalSnapshot.positionsTotal,
      candidatesIngested: finalSnapshot.candidatesIngested,
      exportIngestionMatches: finalSnapshot.exportIngestionMatches,
      exportCoveragePct: finalSnapshot.exportCoveragePct,
      cycleComplete: finalSnapshot.cycleComplete,
      remainingPositions,
      remainingExportCandidates: remainingCandidates,
      estimatedMinutesRemaining,
    },
    newestCandidateValidation: {
      july9: {
        inIngestion: finalSnapshot.newestJuly9InIngestion,
        exportTotal: exportRows.filter((r) => r.appliedAt.startsWith("2026-07-09")).length,
      },
      july8: {
        inIngestion: finalSnapshot.newestJuly8InIngestion,
        exportTotal: exportRows.filter((r) => r.appliedAt.startsWith("2026-07-08")).length,
      },
      july7: {
        inIngestion: finalSnapshot.newestJuly7InIngestion,
        exportTotal: exportRows.filter((r) => r.appliedAt.startsWith("2026-07-07")).length,
      },
      p170StoreHits: finalSnapshot.p170StoreHits,
      p157CohortSize: finalSnapshot.p157CohortSize,
      p171Tracked: finalSnapshot.p171Tracked,
    },
    coverageAfterInvocations,
    invocationSummaries,
    chunkRecords: allChunkRecords,
    missingExportSample: missingExport,
    stallAnalysis,
    conclusion:
      engineReaches100Pct === "yes"
        ? "Existing ingestion engine reached or is on track to reach full parity when allowed to complete."
        : engineReaches100Pct === "no"
          ? `Synchronization stalled: ${stallAnalysis.primaryBottleneck}. Additional code or operational changes required.`
          : "Run hit safety cap before conclusion — extend MAX_INVOCATIONS or run again.",
  };

  const jsonPath = path.join(process.cwd(), "artifacts", "p174.1-complete-sync-validation.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p174.1-complete-sync-validation.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatMarkdown(report), "utf8");

  console.log(JSON.stringify({ ok: true, jsonPath, mdPath, stopReason, final: report.final, conclusion: report.conclusion }, null, 2));
}

function analyzeStall(
  chunks: Array<CandidateIngestionChunkRecord & { invocation: number }>,
  final: CoverageSnapshot,
  stopReason: string,
): {
  primaryBottleneck: string;
  totalFetchFailed: number;
  totalTimeouts: number;
  totalTruncated: number;
  totalPaginationIncomplete: number;
  totalSanitizeRejected: number;
  avgCandidatesPerChunk: number;
  avgPositionsPerChunk: number;
  evidence: string[];
} {
  const totalFetchFailed = chunks.reduce((s, c) => s + c.positionFetchFailed, 0);
  const totalTimeouts = chunks.reduce((s, c) => s + c.positionScanTimedOut, 0);
  const totalTruncated = chunks.filter((c) => c.truncated).length;
  const totalPaginationIncomplete = chunks.reduce((s, c) => s + c.positionPaginationIncomplete, 0);
  const totalSanitizeRejected = chunks.reduce((s, c) => s + c.sanitizeRejected, 0);
  const avgCandidatesPerChunk =
    chunks.length > 0 ? chunks.reduce((s, c) => s + c.candidatesNew, 0) / chunks.length : 0;
  const avgPositionsPerChunk =
    chunks.length > 0 ? chunks.reduce((s, c) => s + c.positionsScanned, 0) / chunks.length : 0;

  const evidence: string[] = [
    `Stop reason: ${stopReason}`,
    `Final position coverage: ${final.positionCoveragePct}%`,
    `Final export ingestion match: ${final.exportCoveragePct}%`,
    `Chunks executed: ${chunks.length}`,
    `Total position fetch failures: ${totalFetchFailed}`,
    `Total position timeouts: ${totalTimeouts}`,
    `Truncated chunks: ${totalTruncated}`,
  ];

  let primaryBottleneck = "none";
  if (stopReason.includes("no_progress")) {
    primaryBottleneck =
      totalTimeouts > 0
        ? "api_timeout_within_chunk_budget"
        : totalFetchFailed > 0
          ? "position_fetch_failures"
          : "runtime_budget_exhausted_before_unscanned_queue_empty";
  } else if (stopReason.includes("no_new_candidates_two_passes")) {
    primaryBottleneck = "breezy_api_returns_fewer_candidates_than_export_per_position";
    if (final.exportCoveragePct < 50) {
      evidence.push(
        `After ${final.positionsTotal} positions scanned twice, export match stalled at ${final.exportCoveragePct}%`,
      );
    }
  } else if (final.positionCoveragePct >= 100 && final.exportCoveragePct < 90) {
    primaryBottleneck = "breezy_api_returns_fewer_candidates_than_export_per_position";
  } else if (!stopReason.includes("full_parity")) {
    primaryBottleneck = "incomplete_run_max_invocations_or_time_budget";
  }

  return {
    primaryBottleneck,
    totalFetchFailed,
    totalTimeouts,
    totalTruncated,
    totalPaginationIncomplete,
    totalSanitizeRejected,
    avgCandidatesPerChunk,
    avgPositionsPerChunk,
    evidence,
  };
}

function formatMarkdown(report: Record<string, unknown>): string {
  const final = report.final as Record<string, number | boolean>;
  const newest = report.newestCandidateValidation as Record<string, unknown>;
  const stall = report.stallAnalysis as { primaryBottleneck: string; evidence: string[] };
  const coverage = report.coverageAfterInvocations as CoverageSnapshot[];

  return `# P174.1 — Complete Breezy Synchronization Validation

Generated: ${report.generatedAt}
Duration: ${Math.round((report.durationMs as number) / 1000)}s

## Conclusion

**${report.conclusion}**

- Stop reason: **${report.stopReason}**
- Engine reaches 100% without additional code: **${report.engineReaches100PctWithoutAdditionalCode}**
- Full parity achieved: **${report.fullParityAchieved}**

## Final state

| Metric | Value |
|--------|-------|
| Positions scanned | ${final.positionsScanned} / ${final.positionsTotal} (${final.positionCoveragePct}%) |
| Candidates ingested | ${final.candidatesIngested} |
| Export matches | ${final.exportIngestionMatches} / ${report.exportTarget} (${final.exportCoveragePct}%) |
| Remaining positions | ${final.remainingPositions} |
| Remaining export candidates | ${final.remainingExportCandidates} |
| Est. minutes remaining | ${final.estimatedMinutesRemaining} |
| Cycle complete | ${final.cycleComplete} |

## Newest candidate validation

- July 9: ${(newest.july9 as { inIngestion: number; exportTotal: number }).inIngestion} / ${(newest.july9 as { exportTotal: number }).exportTotal} in ingestion
- July 8: ${(newest.july8 as { inIngestion: number }).inIngestion} / ${(newest.july8 as { exportTotal: number }).exportTotal}
- July 7: ${(newest.july7 as { inIngestion: number }).inIngestion} / ${(newest.july7 as { exportTotal: number }).exportTotal}
- P170 store hits (export): ${newest.p170StoreHits}
- P157 cohort: ${newest.p157CohortSize}
- P171 tracked: ${newest.p171Tracked}

## Coverage progression

| Inv | Positions | Ingested | Export % | Jul9 | Jul8 |
|-----|-----------|----------|----------|------|------|
${coverage
  .map(
    (c) =>
      `| ${c.invocation} | ${c.positionsScanned}/${c.positionsTotal} | ${c.candidatesIngested} | ${c.exportCoveragePct}% | ${c.newestJuly9InIngestion} | ${c.newestJuly8InIngestion} |`,
  )
  .join("\n")}

## Stall analysis

Primary bottleneck: **${stall.primaryBottleneck}**

${stall.evidence.map((e) => `- ${e}`).join("\n")}

Full data: \`artifacts/p174.1-complete-sync-validation.json\`
`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
