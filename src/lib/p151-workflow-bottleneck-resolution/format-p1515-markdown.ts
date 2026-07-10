import type { BottleneckResolutionReport } from "@/lib/p151-workflow-bottleneck-resolution/types";

export function formatBottleneckResolutionMarkdown(report: BottleneckResolutionReport): string {
  const lines: string[] = [
    "# P151.5 — Workflow Bottleneck Analysis",
    "",
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.dryRun ? "simulation (mechanical fixes projected)" : "live mechanical steps applied"}`,
    "",
    "## Gate assessments",
    "",
  ];

  for (const gate of report.gateAssessments) {
    lines.push(`### ${gate.label} (\`${gate.gateId}\`)`, "");
    lines.push(`- **Classification**: ${gate.classification}`);
    lines.push(`- **Business purpose**: ${gate.businessPurpose}`);
    lines.push(`- **Current implementation**: ${gate.currentImplementation}`);
    lines.push(`- **Required?**: ${gate.required ? "yes" : "no"}`);
    lines.push(`- **Can automate?**: ${gate.canAutomate ? "yes" : "no"}`);
    lines.push(`- **Recommended implementation**: ${gate.recommendedImplementation}`);
    lines.push(`- **Risk**: ${gate.risk}`);
    lines.push("");
  }

  lines.push(
    "## Validation — seven assigned candidates",
    "",
    "### Before mechanical resolution",
    "",
    `- Paperwork Needed: **${report.before.paperworkNeeded}**`,
    `- Ready for Paperwork (P145 queue): **${report.before.readyForPaperwork}**`,
    `- Send Paperwork (P147 eligible): **${report.before.sendPaperwork}**`,
    "",
    "### After mechanical resolution (DM assign + P151 live requireApproval bypass + workflow advance)",
    "",
    `- Paperwork Needed: **${report.afterMechanicalResolution.paperworkNeeded}**`,
    `- Ready for Paperwork (P145 queue): **${report.afterMechanicalResolution.readyForPaperwork}**`,
    `- Send Paperwork (P147 eligible): **${report.afterMechanicalResolution.sendPaperwork}**`,
    "",
    "## Per-candidate comparison",
    "",
    "| Candidate | Before status | After status | Before P144 | After P144 | Before P147 | After P147 | After blocker |",
    "|---|---|---|---|---|---|---|---|",
  );

  for (let i = 0; i < report.before.candidates.length; i += 1) {
    const b = report.before.candidates[i]!;
    const a = report.afterMechanicalResolution.candidates[i]!;
    lines.push(
      `| ${b.candidateName} | ${b.workflowStatus} | ${a.workflowStatus} | ${b.p144NextAction} | ${a.p144NextAction} | ${b.p147Decision} | ${a.p147Decision} | ${a.primaryBlocker ?? "—"} |`,
    );
  }

  lines.push("", "## Automation recommendation", "", report.automationRecommendation, "");

  return `${lines.join("\n")}\n`;
}
