import {
  executeP1885CanaryRestore,
  type P1885ExecutionResult,
} from "@/lib/p188-5-recruiter-restore-canary/execute";
import type { P1885Authorization, P1885FrozenCohort } from "@/lib/p188-5-recruiter-restore-canary/types";
import { P188_6_SUB_BATCH_SIZE } from "@/lib/p188-6-recruiter-restore-batch/types";

/**
 * Execute 50 restores in sub-batches of 10, concurrency 1 throughout.
 * Stops preserving unprocessed members on first failure.
 */
export async function executeP1886BatchRestore(input: {
  cohort: P1885FrozenCohort;
  authorization: P1885Authorization & { authorizationToken: string };
}): Promise<P1885ExecutionResult & { subBatchesCompleted: number }> {
  const members = input.cohort.members;
  const combinedAttempts: P1885ExecutionResult["attempts"] = [];
  let restored = 0;
  let failed = 0;
  let staleConflicts = 0;
  let ledgerEventsWritten = 0;
  let stoppedEarly = false;
  let stopReason: string | null = null;
  let subBatchesCompleted = 0;

  for (let i = 0; i < members.length; i += P188_6_SUB_BATCH_SIZE) {
    const slice = members.slice(i, i + P188_6_SUB_BATCH_SIZE);
    const subCohort: P1885FrozenCohort = {
      ...input.cohort,
      members: slice,
      size: slice.length,
    };
    const result = await executeP1885CanaryRestore({
      cohort: subCohort,
      authorization: input.authorization,
    });
    combinedAttempts.push(...result.attempts);
    restored += result.restored;
    failed += result.failed;
    staleConflicts += result.staleConflicts;
    ledgerEventsWritten += result.ledgerEventsWritten;
    if (result.stoppedEarly || result.failed > 0 || result.restored !== slice.length) {
      stoppedEarly = true;
      stopReason = result.stopReason ?? "Sub-batch failed";
      break;
    }
    subBatchesCompleted += 1;
  }

  return {
    cohortId: input.cohort.cohortId,
    fingerprint: input.cohort.fingerprint,
    attempted: combinedAttempts.length,
    restored,
    failed,
    staleConflicts,
    ledgerEventsWritten,
    stoppedEarly,
    stopReason,
    attempts: combinedAttempts,
    lifecycleWrites: 0,
    recommendations: 0,
    approvals: 0,
    paperworkSends: 0,
    melWrites: 0,
    recruiterWrites: restored,
    subBatchesCompleted,
  };
}
