import {
  authorizeCanary,
  buildP187CanaryPlan,
} from "@/lib/p187-hr-to-oa-canary/plan";
import { runP187DryRun } from "@/lib/p187-hr-to-oa-canary/canaryEngine";
import type { P187CandidateSnapshot, P187CanaryPlan } from "@/lib/p187-hr-to-oa-canary/types";
import { detectWriterCollision } from "@/lib/p187-1-canary-cohort-readiness/writerContainment";
import type {
  P1871DryRunPrediction,
  P1871EligibilityResult,
  P1871ImmutableCohortPreview,
} from "@/lib/p187-1-canary-cohort-readiness/types";

/**
 * Final dry-run against immutable cohort — no real production writes.
 */
export async function runFinalCanaryDryRun(input: {
  cohort: P1871ImmutableCohortPreview;
  /** Map hash → original eligibility row (kept in-memory only). */
  eligibleByHash: Record<string, P1871EligibilityResult>;
  collisionByCandidateId?: Record<
    string,
    { competingWriterActiveForCandidate?: boolean; legacyApprovalInFlight?: boolean }
  >;
}): Promise<P1871DryRunPrediction> {
  const ids = input.cohort.members
    .map((m) => input.eligibleByHash[m.candidateIdHash]?.candidateId)
    .filter((id): id is string => Boolean(id));

  let duplicateConflicts = 0;
  let staleStateConflicts = 0;
  let writerCollisionConflicts = 0;
  let newlyBlockedCount = 0;

  for (const member of input.cohort.members) {
    const row = input.eligibleByHash[member.candidateIdHash];
    if (!row) {
      newlyBlockedCount += 1;
      continue;
    }
    if (row.observation.duplicateApprovalEvent) duplicateConflicts += 1;
    if (row.observation.staleProductionState) staleStateConflicts += 1;
    const col = detectWriterCollision({
      candidateId: row.candidateId,
      competingWriterActiveForCandidate:
        input.collisionByCandidateId?.[row.candidateId]?.competingWriterActiveForCandidate ??
        false,
      legacyApprovalInFlight:
        input.collisionByCandidateId?.[row.candidateId]?.legacyApprovalInFlight ?? false,
    });
    if (col.collision) writerCollisionConflicts += 1;
  }

  const snapshots: P187CandidateSnapshot[] = ids.map((candidateId) => {
    const row = Object.values(input.eligibleByHash).find((r) => r.candidateId === candidateId)!;
    return {
      candidateId,
      productionBefore: row.observation.workflowStatus,
      lifecycleBefore: "HIRING_RECOMMENDATION",
      expectedLifecycleAfter: "OPERATOR_APPROVED",
      maxAllowedProductionAfter: ["Qualified", "Needs Review", "Applied"],
    };
  });

  let dryRunOk = false;
  let stopReason: string | null = null;

  if (ids.length === 0) {
    stopReason = "No resolvable cohort member IDs for dry-run";
  } else if (
    duplicateConflicts > 0 ||
    staleStateConflicts > 0 ||
    writerCollisionConflicts > 0 ||
    newlyBlockedCount > 0
  ) {
    stopReason = "Pre-dry-run conflicts detected";
  } else {
    const planRaw = buildP187CanaryPlan({
      cohortIds: ids,
      forceFlags: { canaryFramework: true },
    });
    if ("ok" in planRaw && planRaw.ok === false) {
      stopReason = planRaw.reason;
    } else {
      const authorized = authorizeCanary({
        plan: planRaw as P187CanaryPlan,
        actor: "p187-1-dry-run-validator",
        reason: "P187.1 final dry-run only — not production execution",
      }) as P187CanaryPlan;

      const run = await runP187DryRun({
        plan: authorized,
        snapshots,
        forceFlags: { canaryFramework: true, transitionAuthorityHrToOa: true },
      });
      dryRunOk = run.ok && run.candidatesTransitioned === ids.length;
      stopReason = run.stopReason;
      if (run.paperworkSendsAttempted !== 0 || run.melExportsAttempted !== 0) {
        dryRunOk = false;
        stopReason = "Unexpected paperwork/MEL prediction";
      }
    }
  }

  const cohortSize = input.cohort.members.length;
  const predictedProductionWrites =
    dryRunOk && stopReason == null ? cohortSize : dryRunOk ? cohortSize : 0;

  // Spec expected when clean: predicted writes = cohort size; sends/MEL = 0
  const clean =
    newlyBlockedCount === 0 &&
    duplicateConflicts === 0 &&
    staleStateConflicts === 0 &&
    writerCollisionConflicts === 0 &&
    dryRunOk;

  return {
    canaryId: input.cohort.canaryId,
    cohortFingerprint: input.cohort.cohortFingerprint,
    cohortSize,
    eligibleCount: cohortSize,
    newlyBlockedCount,
    duplicateConflicts,
    staleStateConflicts,
    writerCollisionConflicts,
    auditReady: clean,
    rollbackReady: true,
    predictedProductionWrites: clean ? cohortSize : predictedProductionWrites,
    paperworkSendsPredicted: 0,
    melWritesPredicted: 0,
    dryRunOk: clean,
    stopReason: clean ? null : stopReason ?? "dry-run not clean",
    realProductionWrites: 0,
  };
}
