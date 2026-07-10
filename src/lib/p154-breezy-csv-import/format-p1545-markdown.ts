import type { BreezyCsvImportFullReport } from "@/lib/p154-breezy-csv-import/types";

export function formatP1545BreezyCsvImportMarkdown(report: BreezyCsvImportFullReport): string {
  const a = report.pipeline.assignment;
  const p = report.pipeline.paperworkEligibility;
  const lines = [
    "# P154.5 — Import Breezy CSV From Disk",
    "",
    `Generated: ${report.generatedAt}`,
    `CSV: \`${report.csvPath}\``,
    "",
    "## Import",
    "",
    `- Total rows: **${report.totalRows}**`,
    `- Imported: **${report.imported}**`,
    `- Updated: **${report.updated}**`,
    `- Skipped: **${report.skipped}**`,
    `- Duplicates: **${report.duplicates}**`,
    `- Unmatched positions: **${report.unmatchedPositions}**`,
    `- Merged into store: **${report.mergedIntoStore}**`,
    `- Workflows created: **${report.workflowsCreated}**`,
    `- Workflows reconciled: **${report.workflowsReconciled}**`,
    "",
    "## Recruiter assignment pipeline",
    "",
    a
      ? [
          `- Candidates evaluated: **${a.candidatesEvaluated}**`,
          `- Assignments completed: **${a.assignmentsCompleted}**`,
          `- Assignments failed: **${a.assignmentsFailed}**`,
          `- Cap reached: **${a.capReached}**`,
        ].join("\n")
      : "—",
    "",
    "## Paperwork eligibility (dry run — no sends)",
    "",
    p
      ? [
          `- Candidates evaluated: **${p.candidatesEvaluated}**`,
          `- Eligible: **${p.eligibleCount}**`,
          `- Would send: **${p.projectedSendCount}**`,
          `- Hard blocked: **${p.blockedCount}**`,
          `- Sent: **${p.sentCount}** (must be 0)`,
        ].join("\n")
      : "—",
    "",
    "## Safety",
    "",
    "- Paperwork sends: disabled",
    "- Duplicate prevention: by candidate ID and email",
    "",
  ];
  if (report.rowErrors.length > 0) {
    lines.push("## Row errors", "");
    for (const err of report.rowErrors.slice(0, 20)) {
      lines.push(`- Row ${err.row}: ${err.message}`);
    }
    if (report.rowErrors.length > 20) {
      lines.push(`- … and ${report.rowErrors.length - 20} more`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
