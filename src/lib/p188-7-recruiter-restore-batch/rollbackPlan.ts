import type { P1885ExecutionResult } from "@/lib/p188-5-recruiter-restore-canary/execute";
import type { P1885FrozenCohort } from "@/lib/p188-5-recruiter-restore-canary/types";

export function buildP1887RollbackPlanMarkdown(input: {
  cohort: P1885FrozenCohort;
  execution: P1885ExecutionResult;
}): string {
  const restored = input.execution.attempts.filter((a) => a.ok);
  return `# P188.7 Rollback Plan

Cohort: \`${input.cohort.cohortId}\`
Fingerprint: \`${input.cohort.fingerprint}\`

## Status

Do **not** automatically roll back on success.
Prepared for ${restored.length} successfully restored assignment(s) in this batch.

## Rules

- Restore previous recruiter (\`Unassigned\` for this batch)
- Append rollback ledger event
- Preserve append-only audit/ledger history
- Do not change lifecycle, paperwork, recommendations, approvals, MEL, or P187
- Idempotent when already Unassigned
- Do not touch P188.5/P188.6 restored assignments

## Safety

Only members of frozen cohort \`${input.cohort.cohortId}\`.
`;
}
