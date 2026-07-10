import type { P1853ReadinessReport } from "@/lib/p185-3-controlled-live-paperwork-rollout/types";

export function formatP1853ReadinessMarkdown(report: P1853ReadinessReport): string {
  return [
    `# ${report.phase} — Controlled Live Rollout Readiness`,
    ``,
    `Generated: ${report.generatedAt}`,
    `Rollout ID: ${report.rolloutId ?? "—"}`,
    `Phase: **${report.rolloutPhase}**`,
    `Live ready: **${report.liveReady}**`,
    `Canary may execute: **${report.canaryMayExecute}**`,
    ``,
    `## Frozen cohort`,
    `- Count: ${report.frozenCohortCount}`,
    `- Still eligible: ${report.dryRun?.stillEligible ?? "—"}`,
    `- Newly blocked: ${report.dryRun?.newlyBlocked ?? "—"}`,
    ``,
    `## Gates`,
    ...Object.entries(report.gates).map(([k, v]) => `- ${k}: ${v ? "OK" : "BLOCKED"}`),
    ``,
    `## Blockers`,
    ...(report.blockers.length ? report.blockers.map((b) => `- ${b}`) : ["- None"]),
    ``,
    `## Setup instructions`,
    ...report.setupInstructions.map((s, i) => `${i + 1}. ${s}`),
    ``,
    `## Warnings`,
    ...report.warnings.map((w) => `- ${w}`),
    ``,
  ].join("\n");
}
