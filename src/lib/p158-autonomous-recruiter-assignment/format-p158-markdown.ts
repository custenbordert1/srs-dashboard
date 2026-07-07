import type { P158AssignmentDashboard } from "@/lib/p158-autonomous-recruiter-assignment/types";

export function formatP158AssignmentMarkdown(dashboard: P158AssignmentDashboard): string {
  const lines = [
    "# P158 — Autonomous Recruiter Assignment Engine",
    "",
    `Generated: ${dashboard.generatedAt}`,
    `Simulation mode: ${dashboard.simulationMode}`,
    `Production enabled: ${dashboard.productionEnabled}`,
    "",
    "## Summary",
    "",
    `- Evaluated: ${dashboard.summary.totalEvaluated}`,
    `- Assignment queue: ${dashboard.summary.assignmentQueue}`,
    `- High confidence: ${dashboard.summary.highConfidence}`,
    `- Manual review: ${dashboard.summary.manualReview}`,
    `- Skipped (existing recruiter): ${dashboard.summary.skippedExisting}`,
    `- Blocked: ${dashboard.summary.blocked}`,
    `- Today's assignments: ${dashboard.summary.todaysAssignments}`,
  ];

  lines.push("", "## Top Simulated Assignments", "");
  for (const row of dashboard.sections.assignmentQueue.slice(0, 10)) {
    lines.push(`### ${row.candidateName}`);
    lines.push(`- Recruiter: ${row.recommendedRecruiter}`);
    lines.push(`- Confidence: ${row.confidence}`);
    lines.push(`- Priority: ${row.priorityScore}`);
    lines.push(`- Territory: ${row.territory ?? "—"}`);
    for (const reason of row.reasoning.slice(0, 4)) {
      lines.push(`- ${reason}`);
    }
    lines.push("");
  }

  lines.push("## Recruiter Workload", "");
  for (const row of dashboard.sections.recruiterWorkload.slice(0, 10)) {
    lines.push(`- ${row.recruiter}: ${row.currentLoad} current, ${row.projectedLoad} projected (+${row.queuedAssignments} queued)`);
  }

  return `${lines.join("\n")}\n`;
}
