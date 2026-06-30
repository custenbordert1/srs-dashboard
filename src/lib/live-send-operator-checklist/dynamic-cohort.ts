import type { LiveSendOperatorChecklistReport, OperatorChecklistItem } from "@/lib/live-send-operator-checklist/types";

/** @deprecated Use dynamic eligible cohort count — kept for backward-compatible artifact references. */
export const P101_EXPECTED_CANDIDATE_COUNT = 27;

export function resolveEligibleCohortCount(input: {
  readyToSend: number;
  blockedEligible: number;
  alreadySent: number;
}): number {
  return input.readyToSend + input.blockedEligible;
}

export function buildDynamicP101Metrics(input: {
  p97PersistedCount: number;
  readyToSend: number;
  duplicateRiskAmongEligible: number;
  invalidEmailAmongEligible: number;
  rollbackCount: number;
  auditLineCount: number;
}): LiveSendOperatorChecklistReport["metrics"] & { eligibleCohortCount: number } {
  const eligibleCohortCount = input.readyToSend;
  return {
    p97PersistedCount: input.p97PersistedCount,
    p99ReadinessApproved: false,
    p100ReadyToSend: input.readyToSend,
    p100AlreadySent: 0,
    candidateCount: eligibleCohortCount,
    duplicateRiskCount: input.duplicateRiskAmongEligible,
    invalidEmailCount: input.invalidEmailAmongEligible,
    liveSend: false,
    p84Enabled: false,
    p84LiveMode: false,
    eligibleCohortCount,
  };
}

export function dynamicChecklistSatisfied(input: {
  checklist: OperatorChecklistItem[];
}): boolean {
  return input.checklist.every((entry) => entry.satisfied);
}
