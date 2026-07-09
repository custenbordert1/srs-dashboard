import type { P181ScopedQueueValidationReport } from "@/lib/p181-scoped-operator-paperwork-queue/types";

export function formatP181Markdown(report: P181ScopedQueueValidationReport): string {
  const lines = [
    `# ${report.sourcePhase} — Scoped Operator Paperwork Queue`,
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Autonomous profile (global pool)",
    "",
    `- Global pool: ${report.autonomous.globalPoolCount}`,
    `- Eligible: ${report.autonomous.eligibleCount}`,
    `- Projected send (cap): ${report.autonomous.projectedSendCount}`,
    `- Top global eligible IDs: ${report.autonomous.topCandidateIds.join(", ") || "none"}`,
    "",
    "## Operator profile (scoped pool)",
    "",
    `- Default scope: \`${JSON.stringify(report.operator.defaultScope)}\``,
    `- Scoped pool: ${report.operator.scopedPoolCount}`,
    `- P178-ready in store: ${report.operator.p178ReadyCount}`,
    `- Eligible in scope: ${report.operator.eligibleCount}`,
    `- Projected send (cap): ${report.operator.projectedSendCount}`,
    `- Scoped candidate IDs: ${report.operator.scopedCandidateIds.join(", ") || "none"}`,
    "",
    "## Comparison",
    "",
    `- Shared eligible: ${report.comparison.sharedEligibleIds.length}`,
    `- Autonomous-only eligible: ${report.comparison.autonomousOnlyCandidateIds.length}`,
    `- Operator-only eligible: ${report.comparison.operatorOnlyCandidateIds.length}`,
    "",
    "## Safety",
    "",
    ...report.safetyConfirmation.map((line) => `- ${line}`),
    "",
  ];
  return lines.join("\n");
}
