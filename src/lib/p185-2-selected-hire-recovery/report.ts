import type { P1852RecoveryReport } from "@/lib/p185-2-selected-hire-recovery/types";

export function formatP1852Markdown(report: P1852RecoveryReport): string {
  return [
    `# ${report.phase} — Selected-Hire Recovery`,
    ``,
    `Generated: ${report.generatedAt}`,
    `Live ready: **${report.liveReady}**`,
    ``,
    `## Evidence sources inspected`,
    ...report.evidenceSourcesInspected.map(
      (s) => `- **${s.source}** (${s.authority}): ${s.role}`,
    ),
    ``,
    `## Counts`,
    ...Object.entries(report.counts).map(([k, v]) => `- ${k}: ${v}`),
    ``,
    `## Comparison`,
    `- Eligible: ${report.comparison.beforeEligible} → ${report.comparison.afterEligible}`,
    `- Queue depth: ${report.comparison.beforeQueueDepth} → ${report.comparison.afterQueueDepth}`,
    ``,
    `## Projection`,
    `- ${report.projection.projectedCompletionLabel}`,
    ...report.projection.rateLimitNotes.map((n) => `- ${n}`),
    ``,
    `## Classifications`,
    ...Object.entries(report.classifications).map(([k, v]) => `- ${k}: ${v}`),
    ``,
    `## Live blockers`,
    ...report.liveBlockers.map((b) => `- ${b}`),
    ``,
    `## Activation steps`,
    ...report.activationSteps.map((s, i) => `${i + 1}. ${s}`),
    ``,
  ].join("\n");
}
