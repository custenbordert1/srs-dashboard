import type { AutonomousRecruiterAssignmentSummary } from "@/lib/p151-autonomous-recruiter-assignment/types";

export function formatP1512AutonomousRecruiterAssignmentMarkdown(
  report: AutonomousRecruiterAssignmentSummary,
): string {
  const lines: string[] = [
    "# P151.2 — Autonomous Recruiter Assignment",
    "",
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.dryRun ? "dry run" : "live"}`,
    `P151 enabled: ${report.autonomousAdvancementEnabled}`,
    "",
    "## Summary",
    "",
    `- Candidates evaluated: ${report.candidatesEvaluated}`,
    `- Assignments completed: ${report.assignmentsCompleted}`,
    `- Assignments skipped (dry run): ${report.assignmentsSkipped}`,
    `- Assignments blocked: ${report.assignmentsBlocked}`,
    `- Assignments failed: ${report.assignmentsFailed}`,
    `- Candidates remaining (unassigned, assignable): ${report.candidatesRemaining}`,
    `- Average recruiter workload: ${report.averageRecruiterWorkload}`,
    `- Execution time: ${report.executionTimeMs}ms`,
    `- Cap reached: ${report.capReached ? "yes" : "no"}`,
    `- Stopped on error: ${report.stoppedOnError ? "yes" : "no"}`,
    "",
    "## Recommendation counts",
    "",
  ];

  for (const [rec, count] of Object.entries(report.recommendationCounts)) {
    lines.push(`- ${rec}: ${count}`);
  }

  lines.push("", "## Recruiter distribution (workload)", "");
  for (const row of report.recruiterDistribution.slice(0, 20)) {
    lines.push(`- ${row.label}: ${row.count}`);
  }

  lines.push("", "## Territory distribution", "");
  for (const row of report.territoryDistribution.slice(0, 20)) {
    lines.push(`- ${row.label}: ${row.count}`);
  }

  lines.push("", "## Top blocker reasons", "");
  for (const row of report.topBlockerReasons.slice(0, 15)) {
    lines.push(`- (${row.count}) ${row.label}`);
  }

  lines.push("", "## Rollback recommendation", "", report.rollbackRecommendation, "");

  lines.push(
    "## Every candidate",
    "",
    "| Candidate | City/State | DM | Territory | Recommendation | Recruiter | Confidence | Reason |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const c of report.candidates) {
    lines.push(
      `| ${c.candidateName} | ${c.cityState} | ${c.dmTerritory ?? "—"} | ${c.recruiterTerritory ?? "—"} | ${c.recommendation} | ${c.recommendedRecruiter ?? c.assignedRecruiter} | ${c.assignmentConfidence}% | ${c.reason.replace(/\|/g, "/")} |`,
    );
  }

  if (report.executionItems.length > 0) {
    lines.push("", "## Execution items", "");
    for (const item of report.executionItems.slice(0, 50)) {
      lines.push(`- ${item.candidateName}: ${item.result} — ${item.reason}`);
    }
    if (report.executionItems.length > 50) {
      lines.push(`- _…and ${report.executionItems.length - 50} more_`);
    }
  }

  return `${lines.join("\n")}\n`;
}
