import type { P1581AssignmentSimulation } from "@/lib/p158-assignment-simulation/types";

export function formatP1581SimulationMarkdown(simulation: P1581AssignmentSimulation): string {
  const s = simulation.summary;
  const lines: string[] = [
    "# P158.1 — Recruiter Assignment Simulation & Impact Analysis",
    "",
    `Generated: ${simulation.generatedAt}`,
    `Mode: read-only simulation (no Breezy or workflow writes)`,
    `Max assignments cap: ${simulation.maxAssignmentsApplied ?? "—"}`,
    "",
    "## Simulation Summary",
    "",
    `- Candidates evaluated: **${s.candidatesEvaluated}**`,
    `- Would assign: **${s.candidatesAssignedInSimulation}**`,
    `- Remaining unassigned: **${s.candidatesRemainingUnassigned}**`,
    `- Avg recruiter utilization: **${s.avgRecruiterUtilization}%**`,
    `- Territory imbalance score: **${s.territoryImbalanceScore}**`,
    s.largestWorkloadIncrease
      ? `- Largest workload increase: **${s.largestWorkloadIncrease.recruiter}** (+${s.largestWorkloadIncrease.delta})`
      : "- Largest workload increase: none",
    "",
    "## Post-Assignment Outcomes (projected)",
    "",
    `- Ready for paperwork: **${s.readyForPaperwork}**`,
    `- Manual review: **${s.manualReview}**`,
    `- Follow up: **${s.followUp}**`,
    `- Blocked: **${s.blocked}**`,
    "",
    "## Before / After Recruiter Workload",
    "",
    "| Recruiter | Before | After | Delta | Utilization |",
    "| --- | ---: | ---: | ---: | ---: |",
  ];

  for (const row of simulation.sections.workloadImpact) {
    lines.push(
      `| ${row.recruiter} | ${row.before} | ${row.after} | ${row.delta >= 0 ? "+" : ""}${row.delta} | ${row.utilizationPercent}% |`,
    );
  }

  lines.push("", "## Territory Heat Map", "", "| Territory | DM | Open demand | Unassigned before | Unassigned after | Assigned | Imbalance |", "| --- | --- | ---: | ---: | ---: | ---: | ---: |");

  for (const cell of simulation.sections.territoryHeatMap.slice(0, 15)) {
    lines.push(
      `| ${cell.territory} | ${cell.dm ?? "—"} | ${cell.openDemand} | ${cell.unassignedBefore} | ${cell.unassignedAfter} | ${cell.assignedInSimulation} | ${cell.imbalanceScore} |`,
    );
  }

  lines.push("", "## Confidence Distribution", "");
  for (const bucket of simulation.sections.confidenceDistribution) {
    lines.push(`- ${bucket.label}: ${bucket.count}`);
  }

  lines.push("", "## Warnings Before Production", "");
  if (simulation.sections.warnings.length === 0) {
    lines.push("- None");
  } else {
    for (const w of simulation.sections.warnings) {
      lines.push(`- [${w.severity}] ${w.message}`);
    }
  }

  lines.push("", "## Projected Paperwork Queue", "");
  const paperwork = simulation.sections.projectedPaperworkQueue;
  if (paperwork.length === 0) {
    lines.push("- No candidates projected to advance to paperwork from this simulation run.");
  } else {
    for (const row of paperwork.slice(0, 20)) {
      lines.push(`- ${row.candidateName} → ${row.recruiter} (${row.p157Action}, ${row.confidence}%)`);
    }
  }

  return lines.join("\n");
}
