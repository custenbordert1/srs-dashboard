import type { CandidateFirstPaperworkReport } from "@/lib/candidate-first-paperwork-eligibility/types";

export function formatCandidateFirstPaperworkMarkdown(
  report: CandidateFirstPaperworkReport,
): string {
  const lines: string[] = [
    "# P151.1 — Candidate-First Paperwork Eligibility",
    "",
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.dryRun ? "dry run" : "live"}`,
    `P151 candidate-first enabled: ${report.candidateFirstEnabled}`,
    "",
    "## Summary",
    "",
    `- Candidates evaluated: ${report.candidatesEvaluated}`,
    `- Sent: ${report.sentCount}`,
    `- Skipped (dry run eligible): ${report.skippedCount}`,
    `- Blocked: ${report.blockedCount}`,
    `- Failures: ${report.failedCount}`,
    `- Duplicates prevented: ${report.duplicatesPrevented}`,
    `- Execution time: ${report.executionTimeMs}ms`,
    "",
    "## Category counts",
    "",
  ];

  for (const [category, count] of Object.entries(report.categoryCounts)) {
    lines.push(`- ${category}: ${count}`);
  }

  lines.push("", "## Recommended action counts", "");
  for (const [action, count] of Object.entries(report.actionCounts)) {
    lines.push(`- ${action}: ${count}`);
  }

  lines.push(
    "",
    "## Safety flags",
    "",
    `- Breezy writes: ${report.safetyFlags.breezyWrites}`,
    `- Execute batch: ${report.safetyFlags.executeBatchCalled}`,
    `- Breezy candidate movement: ${report.safetyFlags.breezyCandidateMovement}`,
    "",
    "## Rollback recommendation",
    "",
    report.rollbackRecommendation,
    "",
    "## Every candidate",
    "",
    "| Candidate | City/State | Original Job Status | Nearest Active Need | Recommended Action | Send Eligible | Reason | Blockers | Manual Review |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );

  for (const c of report.candidates) {
    const blockers = c.blockers.length > 0 ? c.blockers.join("; ") : "—";
    const warnings = c.warnings.length > 0 ? ` Warnings: ${c.warnings.join("; ")}` : "";
    lines.push(
      `| ${c.candidateName} | ${c.cityState} | ${c.originalJobStatus} | ${c.nearestActiveNeed ?? "—"} | ${c.recommendedAction} | ${c.sendPaperworkEligible ? "Yes" : "No"} | ${(c.reason + warnings).replace(/\|/g, "/")} | ${blockers.replace(/\|/g, "/")} | ${c.manualReviewReason?.replace(/\|/g, "/") ?? "—"} |`,
    );
  }

  return `${lines.join("\n")}\n`;
}
