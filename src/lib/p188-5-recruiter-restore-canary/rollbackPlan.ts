import type { P1885FrozenCohort } from "@/lib/p188-5-recruiter-restore-canary/types";
import type { P1885ExecutionResult } from "@/lib/p188-5-recruiter-restore-canary/execute";

export function buildRollbackPlanMarkdown(input: {
  cohort: P1885FrozenCohort;
  execution: P1885ExecutionResult;
}): string {
  const restored = input.execution.attempts.filter((a) => a.ok);
  return `# P188.5 Rollback Plan

Cohort: \`${input.cohort.cohortId}\`
Fingerprint: \`${input.cohort.fingerprint}\`

## Status

Do **not** automatically roll back on success.
Prepared for the ${restored.length} successfully restored assignment(s).

## Rollback rules

- Restore previous recruiter value (Unassigned for this canary)
- Append a rollback ledger event with source referencing the canary correlation
- Preserve audit / ownership ledger history (append-only)
- Do not change lifecycle state, paperwork, recommendations, approvals, MEL, or P187
- Idempotent: re-running rollback when already Unassigned is a no-op success

## Per-candidate rollback package

${restored
  .map(
    (a) => `### ${a.candidateId.slice(0, 4)}…${a.candidateId.slice(-4)}
- previous: Unassigned
- current: ${a.newRecruiter}
- ledgerEventId: ${a.ledgerEventId}
- rollbackReference: see frozen cohort member
`,
  )
  .join("\n")}

## Suggested gated command (not executed)

\`\`\`bash
P188_OWNERSHIP_RESTORE_EXECUTION=true npx tsx scripts/p188-5-rollback-canary.ts \\
  --cohort ${input.cohort.cohortId} \\
  --token "$OPERATOR_TOKEN" \\
  --allow-production-writes
\`\`\`

## Safety

Stop if any candidate outside the frozen cohort is targeted.
`;
}
