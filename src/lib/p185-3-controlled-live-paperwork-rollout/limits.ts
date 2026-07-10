import type {
  P1853CohortMember,
  P1853FrozenCohort,
} from "@/lib/p185-3-controlled-live-paperwork-rollout/types";

/** Canary: max 5 sends, concurrency 1, stop after 1 permanent or 2 transient failures. */
export const CANARY_MAX_SENDS = 5;
export const CANARY_MAX_CONCURRENT = 1;
export const CANARY_PERMANENT_FAILURE_LIMIT = 1;
export const CANARY_TRANSIENT_FAILURE_LIMIT = 2;

/** Post-canary backlog: max 10/cycle, concurrency 2, circuit after 3 failures. */
export const BACKLOG_MAX_SENDS_PER_CYCLE = 10;
export const BACKLOG_MAX_CONCURRENT = 2;
export const BACKLOG_FAILURES_PER_CYCLE = 3;

export const APPROVED_COHORT_SIZE = 25;

/**
 * Reject any attempt to add a candidate that is not already in the frozen cohort.
 * Returns false when expansion would occur.
 */
export function rejectCohortExpansion(
  cohort: P1853FrozenCohort,
  candidateId: string,
): { allowed: false; reason: string } | { allowed: true } {
  if (cohort.members.some((m) => m.candidateId === candidateId)) {
    return { allowed: true };
  }
  return {
    allowed: false,
    reason: "Frozen cohort is immutable — candidates outside the approved set cannot be added.",
  };
}

export function selectSendableCohortMembers(
  cohort: P1853FrozenCohort,
  input: { excludeIds?: Set<string>; max: number },
): P1853CohortMember[] {
  const exclude = input.excludeIds ?? new Set<string>();
  return cohort.members
    .filter((m) => !m.removed && !m.blockedReason && !exclude.has(m.candidateId))
    .slice(0, input.max);
}

export function evaluateCanaryPassCriteria(input: {
  attempted: number;
  permanentFailures: number;
  transientFailures: number;
  paused: boolean;
  attemptsOk: boolean;
}): { passed: boolean; reason: string | null } {
  if (input.paused) {
    return { passed: false, reason: "Canary paused due to failure threshold." };
  }
  if (input.attempted === 0) {
    return { passed: false, reason: "No canary attempts executed." };
  }
  if (input.permanentFailures >= CANARY_PERMANENT_FAILURE_LIMIT) {
    return { passed: false, reason: "Permanent failure during canary." };
  }
  if (input.transientFailures >= CANARY_TRANSIENT_FAILURE_LIMIT) {
    return { passed: false, reason: "Transient failure threshold reached during canary." };
  }
  if (!input.attemptsOk) {
    return { passed: false, reason: "Not all canary attempts reached a safe send state." };
  }
  return { passed: true, reason: null };
}

/** Temporary reconciliation failure must never schedule a resend. */
export function shouldResendAfterReconciliationFailure(): false {
  return false;
}

/** Signed/completed must not be set until Dropbox confirms signed state. */
export function paperworkWorkflowAfterConfirmedSend(): "Paperwork Sent" {
  return "Paperwork Sent";
}

export function paperworkWorkflowAfterSigned(): "Paperwork Completed" {
  return "Paperwork Completed";
}
