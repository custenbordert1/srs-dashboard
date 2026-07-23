import type { P255MissionResult } from "@/lib/p255-recover-eligible-candidates/types";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function formatP255RecoveryReportMarkdown(result: P255MissionResult): string {
  const t = result.totals;
  const lines: string[] = [
    `# P255 — Recover Remaining Eligible Candidates`,
    ``,
    `- Generated: ${result.generatedAt}`,
    `- Ops date: ${result.opsDate}`,
    `- Mode: **${result.mode}** (persist=${result.persist})`,
    `- Source: \`${result.sourceArtifact}\``,
    ``,
    `## Totals`,
    ``,
    `| Metric | Count |`,
    `| --- | ---: |`,
    `| Targeted (P254 auto-recoverable) | ${t.targeted} |`,
    `| Repaired | ${t.repaired} |`,
    `| Now eligible | ${t.nowEligible} |`,
    `| Still blocked | ${t.stillBlocked} |`,
    `| Field changes applied | ${t.fieldChangesApplied} |`,
    ``,
    `## Safety`,
    ``,
    `| Guard | Value |`,
    `| --- | --- |`,
    `| Paperwork sends | ${result.safety.paperworkSends} |`,
    `| Dropbox writes | ${result.safety.dropboxWrites} |`,
    `| Breezy writes | ${result.safety.breezyWrites} |`,
    `| MEL writes | ${result.safety.melWrites} |`,
    `| Workflow writes | ${result.safety.workflowWrites} |`,
    `| Ingestion writes | ${result.safety.ingestionWrites} |`,
    ``,
    `## Candidate outcomes`,
    ``,
  ];

  for (const c of result.candidates) {
    const status = c.nowEligible
      ? "NOW ELIGIBLE"
      : c.stillBlocked
        ? "STILL BLOCKED"
        : "UNKNOWN";
    lines.push(`### ${escapeCell(c.name)} (\`${c.candidateId}\`)`);
    lines.push(``);
    lines.push(`- Email: ${escapeCell(c.email || "—")}`);
    lines.push(`- Status: **${status}**`);
    lines.push(`- Repaired: ${c.repaired ? "yes" : "no"}`);
    lines.push(
      `- Eligibility: \`${c.eligibilityResultBefore}\` → \`${c.eligibilityResultAfter}\``,
    );
    lines.push(
      `- Blockers before: ${c.blockersBefore.length ? c.blockersBefore.map((b) => `\`${b}\``).join(", ") : "none"}`,
    );
    lines.push(
      `- Blockers after: ${c.blockersAfter.length ? c.blockersAfter.map((b) => `\`${b}\``).join(", ") : "none"}`,
    );
    if (c.stillBlockedReasons.length) {
      lines.push(
        `- Still blocked reasons: ${c.stillBlockedReasons.map((b) => `\`${b}\``).join(", ")}`,
      );
    }
    lines.push(
      `- Coverage after: known=${c.coverageKnownAfter} nearestMiles=${c.nearestMilesAfter ?? "—"}`,
    );
    lines.push(``);
    lines.push(`| Field | Before | After | Source | Applied | Reason |`);
    lines.push(`| --- | --- | --- | --- | --- | --- |`);
    if (c.fieldAudits.length === 0) {
      lines.push(`| — | — | — | — | — | No field changes |`);
    } else {
      for (const a of c.fieldAudits) {
        lines.push(
          `| \`${a.field}\` | ${escapeCell(a.before || "(empty)")} | ${escapeCell(a.after || "(empty)")} | \`${a.source}\` | ${a.applied ? "yes" : "no"} | ${escapeCell(a.reason)} |`,
        );
      }
    }
    if (c.notes.length) {
      lines.push(``);
      lines.push(`Notes:`);
      for (const n of c.notes) lines.push(`- ${escapeCell(n)}`);
    }
    lines.push(``);
  }

  if (result.notes.length) {
    lines.push(`## Run notes`, ``);
    for (const n of result.notes) lines.push(`- ${escapeCell(n)}`);
    lines.push(``);
  }

  lines.push(`## Artifacts`, ``);
  for (const a of result.artifacts) lines.push(`- \`${a}\``);
  lines.push(``);

  return `${lines.join("\n")}\n`;
}
