/**
 * P174 — Breezy full synchronization validation
 *
 * Usage: npx tsx scripts/p174-breezy-sync-validation.ts
 */
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { buildBreezySyncValidation } from "@/lib/p174-breezy-sync-reliability";
import type { BreezyExportCandidate } from "@/lib/p174-breezy-sync-reliability/build-breezy-sync-validation";

const WORKBOOK = path.join(process.cwd(), "diagnostics", "Breezy Info.xlsx");

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

function loadExport(): {
  candidates: BreezyExportCandidate[];
  positions: Array<{ position: string; applied: number; location: string }>;
} {
  const wb = XLSX.readFile(WORKBOOK);
  const posRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.Sheets["Breezy_OpenPositions_Statistics"] ?? {},
    { defval: "" },
  );
  const candRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.Sheets["Breezy Applicants"] ?? {},
    { defval: "" },
  );

  const positions = posRows.map((r) => ({
    position: String(r.Position ?? ""),
    applied: Number(r.Applied ?? 0),
    location: String(r.Location ?? ""),
  }));

  const candidates: BreezyExportCandidate[] = candRows.map((r) => {
    const addedDate = Number(r.addedDate ?? 0);
    const addedTime = Number(r.addedTime ?? 0);
    return {
      name: String(r.name ?? ""),
      email: String(r.email_address ?? ""),
      phone: String(r.phone_number ?? ""),
      positionName: String(r.position ?? ""),
      appliedAt: excelDateToIso(addedDate, addedTime),
      recruiter: String(r.sourced_by_name ?? ""),
    };
  });

  candidates.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
  return { candidates, positions };
}

function formatMarkdown(report: Awaited<ReturnType<typeof buildBreezySyncValidation>>): string {
  const d = report.syncDashboard;
  const e = report.executiveSummary;
  const lines = [
    "# P174 — Breezy Full Synchronization & Ingestion Reliability",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## 1. Executive Summary",
    "",
    `- **Parity status:** ${e.parityStatus.toUpperCase()}`,
    `- **Export candidates:** ${e.exportCandidates}`,
    `- **Ingestion candidates:** ${e.ingestionCandidates}`,
    `- **Coverage:** ${e.coveragePct}%`,
    `- **Primary bottleneck:** ${e.primaryBottleneck}`,
    `- **Newest 10 in ingestion:** ${e.newestInIngestion}/10`,
    "",
    "## 2. Synchronization Dashboard",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total Breezy positions | ${d.totalBreezyPositions} |`,
    `| Positions scanned | ${d.positionsScanned} |`,
    `| Positions remaining | ${d.positionsRemaining} |`,
    `| Candidates in export | ${d.candidatesInBreezyExport} |`,
    `| Preview retrieved | ${d.candidatesRetrievedPreview} |`,
    `| Fast retrieved | ${d.candidatesRetrievedFast} |`,
    `| Ingested | ${d.candidatesIngested} |`,
    `| Missing vs export | ${d.candidatesMissing} |`,
    `| Coverage % | ${d.coveragePercentage}% |`,
    `| Cycle complete | ${d.cycleComplete} |`,
    `| Store usable | ${d.ingestionStoreUsable} |`,
    `| Est. chunks remaining | ${d.estimatedChunksRemaining} |`,
    `| Est. minutes to full sync | ${d.estimatedMinutesToFullSync} |`,
    "",
    "## 3. Layer Counts",
    "",
    ...Object.entries(report.layerCounts).map(([k, v]) => `- ${k}: **${v}**`),
    "",
    "## 4. Pagination Analysis",
    "",
    `- Page size: ${report.paginationAnalysis.pageSize}`,
    `- Max pages/position: ${report.paginationAnalysis.maxPagesPerPosition}`,
    `- Sort: ${report.paginationAnalysis.sortOrder}`,
    `- Concurrency: ${report.paginationAnalysis.concurrency}`,
    `- Preview budget: ${report.paginationAnalysis.scanBudgets.previewMs}ms`,
    `- Fast/full budget: ${report.paginationAnalysis.scanBudgets.fastFullAllMs}ms`,
    "",
    "### Stop conditions",
    ...report.paginationAnalysis.stopConditions.map((s) => `- ${s}`),
    "",
    "### Evidence",
    ...report.paginationAnalysis.evidence.map((s) => `- ${s}`),
    "",
    "## 5. Root Cause Analysis",
    "",
    ...Object.entries(report.rootCauseCounts).map(([k, v]) => `- **${k}**: ${v}`),
    "",
    "## 6. Bottlenecks (ranked)",
    "",
    ...report.bottlenecks.map(
      (b) => `### ${b.rank}. ${b.id} (${b.impact})\n${b.detail}\n*Evidence:* ${b.evidence}`,
    ),
    "",
    "## 7. Top 25 Newest — Missing Candidate Traces",
    "",
    "| Applied | Name | Failure | Category |",
    "|---------|------|---------|----------|",
    ...report.top25Newest.map(
      (t) =>
        `| ${t.appliedAt.slice(0, 16)} | ${t.name} | ${t.failurePoint ?? "—"} | ${t.category ?? "—"} |`,
    ),
    "",
    "## 8. Ranked Permanent Fixes",
    "",
    ...report.rankedPermanentFixes.map((f) => `${f.rank}. **${f.roi}** — ${f.fix}`),
    "",
    "## 9. Success Criteria",
    "",
    ...Object.entries(report.successCriteria).map(([k, v]) => `- ${k}: **${v ? "PASS" : "FAIL"}**`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  loadEnvLocal();
  console.error("[P174] Loading Breezy export…");
  const { candidates, positions } = loadExport();

  console.error("[P174] Running live sync validation (read-only API)…");
  const report = await buildBreezySyncValidation({ exportCandidates: candidates, exportPositions: positions });

  const jsonPath = path.join(process.cwd(), "artifacts", "p174-breezy-sync-validation.json");
  const mdPath = path.join(process.cwd(), "artifacts", "p174-breezy-sync-validation.md");
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, formatMarkdown(report), "utf8");

  console.log(JSON.stringify({ ok: true, jsonPath, mdPath, executiveSummary: report.executiveSummary }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
