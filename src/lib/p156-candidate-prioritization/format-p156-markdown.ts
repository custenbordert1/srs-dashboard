import type { P156PrioritizedQueue } from "@/lib/p156-candidate-prioritization/types";
import { formatPriorityExplanationBlock } from "@/lib/p156-candidate-prioritization/explanation-generator";

export function formatP156PrioritizedQueueMarkdown(queue: P156PrioritizedQueue): string {
  const lines: string[] = [
    "# P156 — Intelligent Candidate Prioritization",
    "",
    `Generated: ${queue.generatedAt}`,
    `Read-only: ${queue.readOnly}`,
    `Candidates scored: ${queue.candidates.length}`,
    "",
  ];

  if (queue.warnings.length > 0) {
    lines.push("## Warnings", "");
    for (const warning of queue.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push("");
  }

  lines.push("## Top 10 Priority Candidates", "");
  for (const row of queue.candidates.slice(0, 10)) {
    lines.push(`### ${row.candidateName} (${row.priorityScore})`);
    lines.push("");
    lines.push(formatPriorityExplanationBlock({ priorityScore: row.priorityScore, reasoning: row.reasoning }));
    lines.push("");
    lines.push(`- Recruiter: ${row.recruiter}`);
    lines.push(`- DM: ${row.dm}`);
    lines.push(`- Project: ${row.project ?? "—"}`);
    lines.push(`- Territory: ${row.territory}`);
    lines.push(`- Open demand: ${row.openDemand}`);
    lines.push(`- Days in pipeline: ${row.daysInPipeline ?? "—"}`);
    lines.push(`- Recommended: ${row.recommendedNextAction}`);
    lines.push("");
  }

  lines.push("## Highest Demand Markets", "");
  for (const market of queue.sections.highestDemandMarkets.slice(0, 5)) {
    lines.push(
      `- **${market.territory}** (${market.dmName}) — ${market.openCalls} open calls, ${market.coverageStatus}`,
    );
  }
  lines.push("");

  lines.push("## Section Counts", "");
  lines.push(`- Top priority: ${queue.sections.topPriority.length}`);
  lines.push(`- Ready for paperwork: ${queue.sections.readyForPaperwork.length}`);
  lines.push(`- Awaiting recruiter: ${queue.sections.awaitingRecruiter.length}`);
  lines.push(`- Awaiting follow-up: ${queue.sections.awaitingFollowUp.length}`);
  lines.push(`- Ready for MEL: ${queue.sections.readyForMel.length}`);
  lines.push(`- Highest risk positions: ${queue.sections.highestRiskPositions.length}`);

  return `${lines.join("\n")}\n`;
}
