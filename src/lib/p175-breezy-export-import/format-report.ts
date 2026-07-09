import type { BreezyExportImportPlan, BreezyExportImportResult } from "@/lib/p175-breezy-export-import/types";

export function formatP175Markdown(report: BreezyExportImportPlan | BreezyExportImportResult): string {
  const imported = "imported" in report && report.imported;
  const pre = report.preImport;

  return `# P175 — Breezy Export Import Candidate Source

Generated: ${report.generatedAt}
Workbook: \`${report.workbookPath}\`
Mode: ${imported ? "**IMPORTED**" : "**DRY RUN**"}

## Pre-import

| Metric | Count |
|--------|-------|
| Ingestion count | ${pre.ingestionCount} |
| API-only (unmatched) | ${pre.apiOnlyCount} |
| Export-only (would add) | ${pre.exportOnlyCount} |
| Matched (would merge) | ${pre.matchedCount} |
| Duplicate risk rows | ${pre.duplicateRiskCount} |
| Export rows | ${pre.exportRowCount} |
| Export unique emails | ${pre.exportUniqueEmails} |

## Import plan

| Action | Count |
|--------|-------|
| Would add | ${report.wouldAdd} |
| Would merge | ${report.wouldMerge} |
| Skipped invalid rows | ${report.wouldSkip} |

${
  imported
    ? `## Import result

- Added: **${(report as BreezyExportImportResult).added}**
- Merged: **${(report as BreezyExportImportResult).merged}**
- Post-ingestion count: **${(report as BreezyExportImportResult).postIngestionCount}**
- Rollback: \`${(report as BreezyExportImportResult).rollbackPath ?? "n/a"}\`
- Audit entry: \`${(report as BreezyExportImportResult).auditEntryId ?? "n/a"}\`
`
    : ""
}

## Spotlight

### Patricia Irby
- Discoverable before: ${report.spotlight.patriciaIrby.discoverableBefore ? "yes" : "no"}
- Discoverable after: ${report.spotlight.patriciaIrby.discoverableAfter ? "yes" : "no"}
- Action: ${report.spotlight.patriciaIrby.action}

### July 9 applicants

| Name | Email | Before | After | Action |
|------|-------|--------|-------|--------|
${report.spotlight.july9Applicants
  .map(
    (r) =>
      `| ${r.name} | ${r.email} | ${r.discoverableBefore ? "yes" : "no"} | ${r.discoverableAfter ? "yes" : "no"} | ${r.action} |`,
  )
  .join("\n")}

## Newest 25 after import

| Applied | Name | Action | P170 | P157 |
|---------|------|--------|------|------|
${report.newestAfterImport
  .map(
    (r) =>
      `| ${r.appliedAt.slice(0, 16)} | ${r.name} | ${r.action} | ${r.discoverableP170 ? "yes" : "no"} | ${r.eligibleP157 ? "yes" : "no"} |`,
  )
  .join("\n")}

Full data: \`artifacts/p175-breezy-export-import.json\`
`;
}
