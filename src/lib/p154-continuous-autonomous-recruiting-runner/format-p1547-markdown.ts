import type { P1547AutopilotStatusResponse, P1547CycleReport } from "@/lib/p154-continuous-autonomous-recruiting-runner/types";

export function formatP1547ContinuousRunnerMarkdown(input: {
  status: P1547AutopilotStatusResponse;
  simulationReports?: P1547CycleReport[];
  validation?: {
    buildPassed: boolean;
    testsPassed: boolean;
    noDuplicateSends: boolean;
    noDuplicateAssignments: boolean;
    queueDecreased: boolean;
    dashboardUpdated: boolean;
  };
}): string {
  const lines: string[] = [
    "# P154.7 — Continuous Autonomous Recruiting Runner",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Runner Status",
    "",
    `- **Status:** ${input.status.runnerStatus}`,
    `- **Continuous enabled:** ${input.status.continuousEnabled}`,
    `- **Uptime:** ${input.status.uptimeMs === null ? "n/a" : `${Math.round(input.status.uptimeMs / 1000)}s`}`,
    `- **Next cycle:** ${input.status.nextCycleAt ?? "n/a"}`,
    `- **Queue:** ${input.status.currentQueue}`,
    `- **Today's sends:** ${input.status.todaysSends}`,
    `- **Today's signatures:** ${input.status.todaysSignatures}`,
    `- **Errors:** ${input.status.errors}`,
    "",
  ];

  if (input.status.lastCycle) {
    const c = input.status.lastCycle;
    lines.push(
      "## Last Cycle",
      "",
      `- Cycle #${c.cycleNumber}`,
      `- Duration: ${c.durationMs}ms`,
      `- Evaluated: ${c.candidatesEvaluated}`,
      `- Assigned: ${c.assigned}`,
      `- Sent: ${c.sent}`,
      `- Skipped: ${c.skipped}`,
      `- Duplicates prevented: ${c.duplicatesPrevented}`,
      `- Queue remaining: ${c.queueRemaining}`,
      "",
    );
  }

  if (input.simulationReports?.length) {
    lines.push("## Simulation Cycles", "");
    for (const report of input.simulationReports) {
      lines.push(
        `### Cycle ${report.cycleNumber}`,
        `- Dry run: ${report.dryRun}`,
        `- Evaluated: ${report.metrics.candidatesEvaluated}`,
        `- Assigned: ${report.metrics.assigned}`,
        `- Sent: ${report.metrics.sent}`,
        `- Duplicates prevented: ${report.metrics.duplicatesPrevented}`,
        `- Queue: ${report.metrics.queueRemaining}`,
        `- Webhook sync: ${report.webhookSync?.synced ?? 0} synced, ${report.webhookSync?.errors ?? 0} errors`,
        "",
      );
    }
  }

  if (input.validation) {
    const v = input.validation;
    lines.push(
      "## Validation",
      "",
      `- Build passed: ${v.buildPassed}`,
      `- Tests passed: ${v.testsPassed}`,
      `- No duplicate sends: ${v.noDuplicateSends}`,
      `- No duplicate assignments: ${v.noDuplicateAssignments}`,
      `- Queue decreased correctly: ${v.queueDecreased}`,
      `- Dashboard updated: ${v.dashboardUpdated}`,
      "",
    );
  }

  lines.push(
    "## Activation",
    "",
    "Continuous mode is **disabled by default**. Set `P154_CONTINUOUS_ENABLED=true` on the host (PM2, systemd, Docker) to start 24/7 execution.",
    "",
  );

  return lines.join("\n");
}
