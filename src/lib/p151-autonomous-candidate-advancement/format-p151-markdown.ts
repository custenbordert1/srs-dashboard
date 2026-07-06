import type { PipelineAdvancementSummary } from "@/lib/p151-autonomous-candidate-advancement/types";

export function formatP151AutonomousCandidateAdvancementMarkdown(
  report: PipelineAdvancementSummary,
): string {
  const lines: string[] = [
    "# P151 — Autonomous Candidate Advancement",
    "",
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.dryRun ? "dry run" : "live"}`,
    `P151 enabled: ${report.autonomousAdvancementEnabled}`,
    "",
    "## Execution summary",
    "",
    `- Candidates evaluated: ${report.candidatesEvaluated}`,
    `- Eligible for assignment: ${report.candidatesEligibleForAssignment}`,
    `- Eligible for advancement: ${report.candidatesEligibleForAdvancement}`,
    `- Recruiters assigned: ${report.recruitersAssigned}`,
    `- Candidates advanced: ${report.candidatesAdvanced}`,
    `- Blocked: ${report.candidatesBlocked}`,
    `- Skipped: ${report.candidatesSkipped}`,
    `- Failures: ${report.failures}`,
    `- Execution time: ${report.executionTimeMs}ms`,
    `- Readiness score: ${report.readinessScore}/100`,
    `- Cap reached: ${report.capReached ? "yes" : "no"}`,
    `- Stopped on error: ${report.stoppedOnError ? "yes" : "no"}`,
    "",
    "## Safety flags",
    "",
    `- Breezy writes: ${report.safetyFlags.breezyWrites}`,
    `- Execute batch: ${report.safetyFlags.executeBatchCalled}`,
    `- P151 enabled: ${report.safetyFlags.p151Enabled}`,
    `- Require approval bypassed: ${report.safetyFlags.requireApprovalBypassed}`,
    "",
    "## Candidates by next action (P144)",
    "",
  ];

  for (const [action, count] of Object.entries(report.nextActionCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${action}: ${count}`);
  }

  lines.push("", "## Pipeline flow (dashboard categories)", "");
  for (const [stage, count] of Object.entries(report.dashboard.pipelineFlow).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${stage}: ${count}`);
  }

  lines.push("", "## Top blockers (ranked by frequency)", "");
  for (const { blocker, count } of report.topBlockerCounts.slice(0, 25)) {
    lines.push(`- (${count}) ${blocker}`);
  }

  lines.push(
    "",
    "## Dashboard metrics",
    "",
    `- Waiting assignment: ${report.dashboard.candidatesWaitingAssignment}`,
    `- Advanced today: ${report.dashboard.candidatesAdvancedToday}`,
    `- Assignments today: ${report.dashboard.assignmentsCompletedToday}`,
    `- Blocked candidates: ${report.dashboard.blockedCandidates}`,
    "",
    "### Average time in stage (hours)",
    "",
  );
  for (const [status, hours] of Object.entries(report.dashboard.averageTimeInStageHours).sort(
    (a, b) => b[1] - a[1],
  )) {
    lines.push(`- ${status}: ${hours}h`);
  }

  lines.push("", "## Rollback recommendation", "", report.rollbackRecommendation, "");

  lines.push("## Every candidate — exact blocker report", "");
  lines.push(
    "| Candidate | Stage | Next Action | Blockers | Preventing Rule | Recommended Fix | Automation Eligible |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const c of report.analysis) {
    const blockers = c.blockers.length > 0 ? c.blockers.join("; ") : "—";
    lines.push(
      `| ${c.candidateName} | ${c.workflowStatus} / ${c.breezyStage} | ${c.nextAction} | ${blockers.replace(/\|/g, "/")} | ${c.preventingRule.replace(/\|/g, "/")} | ${c.recommendedFix.replace(/\|/g, "/")} | ${c.automationEligible ? "Yes" : "No"} |`,
    );
  }

  if (report.executionItems.length > 0) {
    lines.push("", "## Execution items", "");
    for (const item of report.executionItems) {
      lines.push(
        `- **${item.candidateName}** (${item.candidateId}) — ${item.phase} / ${item.result}: ${item.reason}`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}
