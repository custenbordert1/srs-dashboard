import type {
  P254MissionResult,
  P254RecoverableImpact,
} from "@/lib/p254-eligibility-forensics/types";
import { buildP254ComboRecoverableImpact } from "@/lib/p254-eligibility-forensics/classify";
import type { P253CandidateRow } from "@/lib/p253-controlled-live-paperwork-send/types";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function formatP254EligibilityForensicsMarkdown(
  result: P254MissionResult,
  sourceRows: P253CandidateRow[],
): string {
  const t = result.totals;
  const lines: string[] = [
    `# P254 — Why Are No Candidates Eligible?`,
    ``,
    `- Generated: ${result.generatedAt}`,
    `- Ops date: ${result.opsDate}`,
    `- Mode: **${result.mode}**`,
    `- Source: \`${result.sourceArtifact}\` (P253 generated ${result.sourceGeneratedAt ?? "unknown"})`,
    `- P253 mode: ${result.p253Mode ?? "unknown"}${result.p253AbortReason ? ` — ${result.p253AbortReason}` : ""}`,
    ``,
    `## Totals`,
    ``,
    `| Metric | Count |`,
    `| --- | ---: |`,
    `| Reviewed | ${t.reviewed} |`,
    `| Blocked | ${t.blocked} |`,
    `| Eligible (P253) | ${t.eligible} |`,
    `| Automatically recoverable | ${t.automaticallyRecoverable} |`,
    `| Requiring manual action | ${t.requiringManualAction} |`,
    ``,
    `## Failure groups`,
    ``,
    `| Group | Count | Auto-recoverable | Manual |`,
    `| --- | ---: | ---: | ---: |`,
  ];

  for (const g of result.failureGroups) {
    if (g.count === 0) continue;
    lines.push(
      `| ${g.group} | ${g.count} | ${g.automaticallyRecoverable} | ${g.requiringManualAction} |`,
    );
  }
  lines.push(``);

  lines.push(
    `## Recoverable impact (single-issue fix)`,
    ``,
    `Exact count that would become **P253-eligible** if only that issue were fixed (other blockers remain).`,
    ``,
    `| Issue | Candidates with issue | Would become eligible if fixed |`,
    `| --- | ---: | ---: |`,
  );
  for (const row of result.recoverableImpact) {
    lines.push(
      `| ${row.label} | ${row.candidatesWithIssue} | ${row.wouldBecomeEligibleIfFixed} |`,
    );
  }
  lines.push(``);

  const combos = buildP254ComboRecoverableImpact(sourceRows);
  lines.push(
    `## Recoverable impact (combined fixes)`,
    ``,
    `| Fix set | Would become eligible |`,
    `| --- | ---: |`,
  );
  for (const c of combos) {
    lines.push(`| ${c.label} | ${c.wouldBecomeEligibleIfFixed} |`);
  }
  lines.push(``);

  lines.push(
    `## Key blocked candidates (not already-sent / packet-pending / signed)`,
    ``,
  );
  const spotlight = result.candidates.filter(
    (c) =>
      c.failureGroup !== "Already sent" &&
      c.failureGroup !== "Packet pending" &&
      c.failureGroup !== "Already signed",
  );
  if (spotlight.length === 0) {
    lines.push(`_None — every exclusion fell into sent / packet / signed buckets._`, ``);
  } else {
    lines.push(
      `| Name | Workflow | Breezy | Dropbox | Recruiter | DM | Miles | Gate | Recoverable? | Action |`,
    );
    lines.push(`| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- |`);
    for (const c of spotlight) {
      lines.push(
        `| ${escapeCell(c.name)} | ${escapeCell(c.workflowStage)} | ${escapeCell(c.breezyStage ?? "")} | ${escapeCell(c.dropboxSignStatus)} | ${escapeCell(c.recruiter)} | ${escapeCell(c.districtManager)} | ${c.distanceMiles ?? ""} | ${escapeCell(c.exactGateFailed)} | ${c.automaticallyRecoverable ? "yes" : "no"} | ${escapeCell(c.requiredAction)} |`,
      );
    }
    lines.push(``);
  }

  lines.push(`## All candidates (forensic)`, ``);
  lines.push(
    `| Name | Workflow | Breezy | Dropbox | Recruiter | DM | Miles | Result | Gate | Group | Recoverable? | Action |`,
  );
  lines.push(
    `| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- |`,
  );
  for (const c of result.candidates) {
    lines.push(
      `| ${escapeCell(c.name)} | ${escapeCell(c.workflowStage)} | ${escapeCell(c.breezyStage ?? "")} | ${escapeCell(c.dropboxSignStatus)} | ${escapeCell(c.recruiter)} | ${escapeCell(c.districtManager)} | ${c.distanceMiles ?? ""} | ${escapeCell(c.eligibilityResult)} | ${escapeCell(c.exactGateFailed)} | ${escapeCell(c.failureGroup)} | ${c.automaticallyRecoverable ? "yes" : "no"} | ${escapeCell(c.requiredAction)} |`,
    );
  }
  lines.push(``);

  lines.push(
    `## Enrichment`,
    ``,
    `- Durable workflow read: ${result.enrichment.durableWorkflowRead}`,
    `- Durable ingestion read: ${result.enrichment.durableIngestionRead}`,
    `- Breezy stages resolved: ${result.enrichment.breezyStagesResolved}`,
    `- Paths: ${result.enrichment.durablePaths.join(", ") || "(none)"}`,
    ``,
    `## Safety`,
    ``,
    `- Paperwork sends: ${result.safety.paperworkSends}`,
    `- Workflow writes: ${result.safety.workflowWrites}`,
    `- Dropbox writes: ${result.safety.dropboxWrites}`,
    `- Breezy writes: ${result.safety.breezyWrites}`,
    `- MEL writes: ${result.safety.melWrites}`,
    ``,
    `## Artifacts`,
    ``,
  );
  for (const a of result.artifacts) lines.push(`- \`${a}\``);
  lines.push(``);

  return `${lines.join("\n")}\n`;
}

export function formatP254RecoverableImpactTable(
  impact: P254RecoverableImpact[],
): string {
  return impact
    .map(
      (r) =>
        `${r.label}: withIssue=${r.candidatesWithIssue} → eligibleIfFixed=${r.wouldBecomeEligibleIfFixed}`,
    )
    .join("\n");
}
