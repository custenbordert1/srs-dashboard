import type { RecommendationPriority } from "@/lib/executive-recruiting-forecast";
import type { ExecutiveWeeklyPacket } from "@/lib/executive-accountability/weekly-executive-packet";

const PRIORITIES: RecommendationPriority[] = ["critical", "high", "medium", "low"];

function section(title: string, lines: string[]): string {
  if (lines.length === 0) return `## ${title}\n\n_None this week._\n`;
  return `## ${title}\n\n${lines.map((line) => `- ${line}`).join("\n")}\n`;
}

function formatActionLine(title: string, owner: string | null, due?: string): string {
  const ownerLabel = owner?.trim() || "Unassigned";
  if (due) return `**${title}** — ${ownerLabel} (due ${due})`;
  return `**${title}** — ${ownerLabel}`;
}

export function formatExecutiveEmailMarkdown(packet: ExecutiveWeeklyPacket): string {
  const weekOf = new Date(packet.periodStart).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const openLines: string[] = [];
  for (const priority of PRIORITIES) {
    for (const action of packet.openActionsByPriority[priority]) {
      openLines.push(
        `[${priority.toUpperCase()}] ${formatActionLine(
          action.title,
          action.owner,
          new Date(action.dueDate).toLocaleDateString(),
        )}`,
      );
    }
  }

  const overdueLines = Object.entries(packet.overdueByOwner).flatMap(([owner, actions]) =>
    actions.map(
      (action) =>
        `${formatActionLine(action.title, owner, new Date(action.dueDate).toLocaleDateString())} — ${action.priority} priority`,
    ),
  );

  const completedLines = Object.entries(packet.completedThisWeekByOwner).flatMap(
    ([owner, actions]) => actions.map((action) => formatActionLine(action.title, owner)),
  );

  const forecastLines = packet.forecastChanges.lines.map(
    (line) => `${line.label}: ${line.before} → ${line.after} (${line.direction})`,
  );

  const recommendationLines = packet.recommendations.map(
    (rec) => `[${rec.priority.toUpperCase()}] ${rec.title}${rec.owner ? ` — ${rec.owner}` : ""}`,
  );

  return [
    `# Executive Summary — Week of ${weekOf}`,
    "",
    packet.narrative.summaryParagraph,
    "",
    "### What improved",
    ...(packet.narrative.improved.length > 0
      ? packet.narrative.improved.map((line) => `- ${line}`)
      : ["- No major improvements flagged."]),
    "",
    "### What worsened",
    ...(packet.narrative.worsened.length > 0
      ? packet.narrative.worsened.map((line) => `- ${line}`)
      : ["- No major regressions flagged."]),
    "",
    "### Immediate leadership actions",
    ...(packet.narrative.immediateLeadershipActions.length > 0
      ? packet.narrative.immediateLeadershipActions.map((line) => `- ${line}`)
      : ["- Monitor open accountability queue."]),
    "",
    section("Open Actions", openLines),
    section("Overdue Actions", overdueLines),
    section("Completed Actions", completedLines),
    section("Forecast Changes", forecastLines),
    section("Top Risks", packet.topRisks),
    section("Recommendations", recommendationLines),
    "---",
    `_Generated ${new Date(packet.generatedAt).toLocaleString()} from SRS Executive Accountability._`,
  ].join("\n");
}
