import type { ImmediatePaperworkPolicyReport } from "@/lib/p152-immediate-paperwork-policy/types";

export function formatImmediatePaperworkPolicyMarkdown(
  report: ImmediatePaperworkPolicyReport,
): string {
  const lines: string[] = [
    "# P152 — Immediate Paperwork Policy",
    "",
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.dryRun ? "dry run" : "live"}`,
    `P152 enabled: ${report.immediatePaperworkEnabled}`,
    "",
    "## Summary",
    "",
    `- Candidates evaluated: **${report.candidatesEvaluated}**`,
    `- Eligible under new policy: **${report.eligibleCount}**`,
    `- Excluded: **${report.excludedCount}**`,
    `- Projected sends (cap ${report.maxSendsLimit}): **${report.projectedSendCount}**`,
    `- Sent: **${report.sentCount}**`,
    `- Failed: **${report.failedCount}**`,
    `- Cap reached: ${report.capReached ? "yes" : "no"}`,
    `- Stopped on error: ${report.stoppedOnError ? "yes" : "no"}`,
    "",
    "## Hard exclusion reasons",
    "",
  ];

  for (const [reason, count] of Object.entries(report.exclusionSummary).sort((a, b) => b[1] - a[1])) {
    lines.push(`- **${reason}**: ${count}`);
  }

  lines.push("", "## Legacy rules bypassed by P152", "");
  for (const rule of report.bypassedRules) {
    lines.push(`- ${rule}`);
  }

  lines.push("", "## Eligible candidates", "");
  lines.push("| Candidate | Recruiter | Status | Legacy rules bypassed |");
  lines.push("|---|---|---|---|");
  for (const row of report.candidates.filter((c) => c.eligible)) {
    lines.push(
      `| ${row.candidateName} | ${row.recruiter} | ${row.workflowStatus} | ${row.legacyBlockersBypassed.length} |`,
    );
  }

  lines.push("", "## Excluded candidates", "");
  lines.push("| Candidate | Recruiter | Hard blocker |");
  lines.push("|---|---|---|");
  for (const row of report.candidates.filter((c) => !c.eligible)) {
    lines.push(`| ${row.candidateName} | ${row.recruiter} | ${row.hardBlockers.join("; ")} |`);
  }

  if (report.executionItems.length > 0) {
    lines.push("", "## Execution items", "");
    for (const item of report.executionItems) {
      lines.push(`- **${item.candidateName}** — ${item.sendResult}: ${item.reason}`);
    }
  }

  lines.push("", "## Rollback", "", report.rollbackRecommendation, "");

  return `${lines.join("\n")}\n`;
}
