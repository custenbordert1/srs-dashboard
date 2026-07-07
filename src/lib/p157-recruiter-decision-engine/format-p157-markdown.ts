import type { P157DecisionDashboard } from "@/lib/p157-recruiter-decision-engine/types";
import { formatDecisionExplanationBlock } from "@/lib/p157-recruiter-decision-engine/explanation-generator";

export function formatP157DecisionDashboardMarkdown(dashboard: P157DecisionDashboard): string {
  const lines: string[] = [
    "# P157 — Intelligent Recruiter Decision Engine",
    "",
    `Generated: ${dashboard.generatedAt}`,
    `Read-only: ${dashboard.readOnly}`,
    `Candidates: ${dashboard.summary.totalCandidates}`,
    "",
    "## Executive Summary",
    "",
    `- High confidence decisions: ${dashboard.summary.highConfidenceCount}`,
    `- Manual review: ${dashboard.summary.manualReviewCount}`,
    `- Blocked: ${dashboard.summary.blockedCount}`,
    `- Average confidence: ${dashboard.summary.avgConfidence}`,
    `- Top action: ${dashboard.summary.topAction ?? "—"}`,
    "",
    "## Decision Distribution",
    "",
  ];

  for (const row of dashboard.distribution) {
    lines.push(`- **${row.action}**: ${row.count} (avg confidence ${row.avgConfidence})`);
  }

  lines.push("", "## Top 10 Recommended Actions", "");

  for (const row of dashboard.decisions.slice(0, 10)) {
    lines.push(`### ${row.candidateName}`);
    lines.push("");
    lines.push(formatDecisionExplanationBlock({
      action: row.action,
      confidence: row.confidence,
      reasoning: row.reasoning,
    }));
    lines.push("");
    lines.push(`- Priority: ${row.priorityScore}`);
    lines.push(`- Recruiter: ${row.recruiter}`);
    lines.push(`- DM: ${row.dm}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
