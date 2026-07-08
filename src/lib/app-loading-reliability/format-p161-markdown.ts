import type { P161AppHealthReport } from "@/lib/app-loading-reliability/build-app-health";

export function formatP161Markdown(input: {
  report: P161AppHealthReport;
  validation: Record<string, unknown>;
}): string {
  const { report, validation } = input;
  const lines: string[] = [
    "# P161 — Global App Loading Reliability",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Operating mode",
    "",
    `- **Label:** ${report.operatingMode.label}`,
    `- **Continuous enabled:** ${report.operatingMode.continuousEnabled}`,
    `- **Daemon running:** ${report.operatingMode.daemonRunning}`,
    `- **System mode:** ${report.operatingMode.systemMode}`,
    "",
    "## System status snapshot",
    "",
    `| Metric | Value |`,
    `| --- | --- |`,
    `| Paperwork sent today | ${report.systemStatus.paperworkSentToday} |`,
    `| Send batches today | ${report.systemStatus.sendBatchesToday} |`,
    `| Failures today | ${report.systemStatus.failuresToday} |`,
    `| Eligible now | ${report.systemStatus.eligibleNow} |`,
    `| Queue remaining | ${report.systemStatus.queueRemaining} |`,
    `| Last production cycle | ${report.systemStatus.lastProductionCycle ?? "—"} |`,
    `| Readiness score | ${report.systemStatus.readinessScore ?? "—"} |`,
    "",
    "## Validation",
    "",
    "```json",
    JSON.stringify(validation, null, 2),
    "```",
    "",
    "## Degraded sections",
    "",
  ];

  if (report.degradedSections.length === 0) {
    lines.push("- None");
  } else {
    for (const id of report.degradedSections) {
      lines.push(`- ${id}`);
    }
  }

  lines.push("", "## Warnings", "");
  if (report.warnings.length === 0) {
    lines.push("- None");
  } else {
    for (const w of report.warnings) {
      lines.push(`- ${w}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
