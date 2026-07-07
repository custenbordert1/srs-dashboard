import type { P1582OutcomeDiagnosis } from "@/lib/p158-post-assignment-outcome-diagnosis/types";

export function formatP1582DiagnosisMarkdown(diagnosis: P1582OutcomeDiagnosis): string {
  const s = diagnosis.summary;
  const lines: string[] = [
    "# P158.2 — Post-Assignment Outcome Diagnosis",
    "",
    `Generated: ${diagnosis.generatedAt}`,
    "Mode: read-only diagnosis (no assignments, Breezy, workflow, or paperwork writes)",
    "",
    "## Executive Summary",
    "",
    `- Candidates diagnosed: **${s.candidatesDiagnosed}**`,
    `- Post-assignment → Send Paperwork: **${s.sendPaperworkCount}**`,
    `- Post-assignment → Manual Review: **${s.manualReviewCount}**`,
    `- Blocked: **${s.blockedCount}**`,
    `- Other actions: **${s.otherActionCount}**`,
    `- Estimated paperwork lift from safest fix: **${s.estimatedPaperworkLift}** candidates`,
    "",
    "## Safest Next Change",
    "",
    s.safestNextChange,
    "",
    "## Blocker Counts",
    "",
    "| Blocker | Count | Class | Automatable |",
    "| --- | ---: | --- | ---: |",
  ];

  for (const row of s.blockerCounts) {
    lines.push(`| ${row.code} | ${row.count} | ${row.blockerClass} | ${row.automatableCount} |`);
  }

  lines.push("", "## Blocker Classification", "");
  for (const [cls, count] of Object.entries(s.classCounts)) {
    lines.push(`- ${cls}: **${count}**`);
  }

  lines.push("", "## Per-Candidate Diagnosis", "", "| Candidate | Action | Blocker | Automatable | Fix |", "| --- | --- | --- | --- | --- |");

  for (const row of diagnosis.candidates) {
    lines.push(
      `| ${row.candidateName} | ${row.postAssignmentAction} | ${row.primaryBlocker} | ${row.automatable ? "yes" : "no"} | ${row.recommendedFix.slice(0, 80)}… |`,
    );
  }

  lines.push("", "## Detailed Blocker Reasons", "");
  for (const row of diagnosis.candidates) {
    lines.push(`### ${row.candidateName}`, `- Action: ${row.postAssignmentAction}`, `- Blocker: ${row.blockerReason}`, `- Workflow: ${row.workflowStatus} · Paperwork stage: ${row.paperworkStage ?? "none"}`, "");
  }

  return lines.join("\n");
}
