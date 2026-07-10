import type { P1851RecoveryReport } from "@/lib/p185-1-paperwork-eligibility-recovery/types";

export function formatP1851Markdown(report: P1851RecoveryReport): string {
  return [
    `# ${report.phase} — Paperwork Eligibility Recovery`,
    ``,
    `Generated: ${report.generatedAt}`,
    `Live ready: **${report.liveReady}**`,
    ``,
    `## Root cause (528 job mismatches)`,
    ...report.rootCause.map((r) => `- ${r}`),
    ``,
    `## Mapping coverage`,
    `- Before unmatched: ${report.mappingCoverage.beforeUnmatched}`,
    `- After unresolved: ${report.mappingCoverage.afterUnresolved}`,
    `- Before matched: ${report.mappingCoverage.beforeMatched}`,
    `- After matched: ${report.mappingCoverage.afterMatched}`,
    `- Coverage after: ${report.mappingCoverage.coveragePctAfter}%`,
    ``,
    `## Envelope reconciliation`,
    `- Attempted: ${report.envelopeReconciliation.attempted}`,
    `- Replacement review: ${report.envelopeReconciliation.replacementReview}`,
    `- Unresolved: ${report.envelopeReconciliation.unresolved}`,
    `- By lifecycle: ${JSON.stringify(report.envelopeReconciliation.byLifecycle)}`,
    ``,
    `## Classifications`,
    ...Object.entries(report.classifications).map(([k, v]) => `- ${k}: ${v}`),
    ``,
    `## Corrected dry-run`,
    `- Evaluated: ${report.dryRun.evaluated}`,
    `- Eligible (P184): ${report.dryRun.eligible}`,
    `- Rejected: ${report.dryRun.rejected}`,
    `- Queue depth: ${report.dryRun.queueDepth}`,
    `- Est. clearance: ${report.dryRun.estimatedClearanceMinutes} min`,
    `- Projected / hour: ${report.dryRun.projectedSendsPerHour}`,
    `- Projected / day: ${report.dryRun.projectedSendsPerDay}`,
    ``,
    `## Comparison`,
    `- Eligible before → after: ${report.comparison.beforeEligible} → ${report.comparison.afterEligible}`,
    `- Unmatched jobs before → unresolved after: ${report.comparison.beforeUnmatchedJobs} → ${report.comparison.afterUnresolvedJobs}`,
    ``,
    `## Live blockers`,
    ...report.liveBlockers.map((b) => `- ${b}`),
    ``,
    `## Controlled limits`,
    "```json",
    JSON.stringify(report.controlledLimits, null, 2),
    "```",
    ``,
    `## Activation steps`,
    ...report.activationSteps.map((s, i) => `${i + 1}. ${s}`),
    ``,
  ].join("\n");
}

export const P1851_SECRET_SETUP_DOC = `
# P185 / P185.1 scheduler & production secrets

Never commit real secrets. Never pass secrets via query parameters.
Never log secrets or include them in artifacts / client API responses.

Required for scheduled production (after operator approval):

| Variable | Purpose |
|----------|---------|
| CRON_SECRET or P185_CRON_SECRET | Bearer / x-cron-secret auth for /api/cron/p185-paperwork-automation |
| P185_PRODUCTION_AUTOMATION_ENABLED=1 | Explicit production automation gate |
| P185_DURABLE_DATA_DIR | Absolute durable volume on serverless (not /tmp) |
| DROPBOX_SIGN_API_KEY | Dropbox Sign API |
| DROPBOX_SIGN_TEMPLATE_* | Required template IDs |

Local example (.env.local — gitignored):

\`\`\`
CRON_SECRET=generate-a-long-random-value
P185_PRODUCTION_AUTOMATION_ENABLED=
P185_DURABLE_DATA_DIR=
\`\`\`

Leave P185_PRODUCTION_AUTOMATION_ENABLED unset until live activation checklist is complete.
`.trim();
