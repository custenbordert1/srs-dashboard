import {
  OwnershipConcurrencyError,
  getCandidateWorkflowState,
  upsertCandidateWorkflow,
} from "@/lib/candidate-workflow-store";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import { listOwnershipLedgerForCandidate } from "@/lib/p188-4-recruiter-ownership-durability/ledgerStore";
import { assertCohortImmutable } from "@/lib/p188-5-recruiter-restore-canary/freeze";
import type {
  P1885Authorization,
  P1885FrozenCohort,
  P1885RestoreAttempt,
} from "@/lib/p188-5-recruiter-restore-canary/types";

const LIFECYCLE_FIELDS = [
  "workflowStatus",
  "paperworkStatus",
  "recommendedStage",
  "signatureRequestId",
  "paperworkSentAt",
] as const;

export type P1885ExecutionResult = {
  cohortId: string;
  fingerprint: string;
  attempted: number;
  restored: number;
  failed: number;
  staleConflicts: number;
  ledgerEventsWritten: number;
  stoppedEarly: boolean;
  stopReason: string | null;
  attempts: P1885RestoreAttempt[];
  lifecycleWrites: 0;
  recommendations: 0;
  approvals: 0;
  paperworkSends: 0;
  melWrites: 0;
  recruiterWrites: number;
};

/**
 * Sequential (concurrency=1) production restore for frozen canary cohort only.
 */
export async function executeP1885CanaryRestore(input: {
  cohort: P1885FrozenCohort;
  authorization: P1885Authorization & { authorizationToken: string };
}): Promise<P1885ExecutionResult> {
  const attempts: P1885RestoreAttempt[] = [];
  let restored = 0;
  let failed = 0;
  let staleConflicts = 0;
  let ledgerEventsWritten = 0;
  let stoppedEarly = false;
  let stopReason: string | null = null;

  if (input.authorization.fingerprint !== input.cohort.fingerprint) {
    return {
      cohortId: input.cohort.cohortId,
      fingerprint: input.cohort.fingerprint,
      attempted: 0,
      restored: 0,
      failed: 0,
      staleConflicts: 0,
      ledgerEventsWritten: 0,
      stoppedEarly: true,
      stopReason: "Authorization fingerprint mismatch",
      attempts: [],
      lifecycleWrites: 0,
      recommendations: 0,
      approvals: 0,
      paperworkSends: 0,
      melWrites: 0,
      recruiterWrites: 0,
    };
  }

  if (Date.parse(input.authorization.expiresAt) < Date.now()) {
    return {
      cohortId: input.cohort.cohortId,
      fingerprint: input.cohort.fingerprint,
      attempted: 0,
      restored: 0,
      failed: 0,
      staleConflicts: 0,
      ledgerEventsWritten: 0,
      stoppedEarly: true,
      stopReason: "Authorization expired",
      attempts: [],
      lifecycleWrites: 0,
      recommendations: 0,
      approvals: 0,
      paperworkSends: 0,
      melWrites: 0,
      recruiterWrites: 0,
    };
  }

  for (const member of input.cohort.members) {
    try {
      assertCohortImmutable(input.cohort, member.candidateId);
    } catch (err) {
      stoppedEarly = true;
      stopReason = err instanceof Error ? err.message : String(err);
      break;
    }

    const workflows = await getCandidateWorkflowState();
    const wf = workflows[member.candidateId];
    if (!wf) {
      failed += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: false,
        detail: "Workflow missing",
        previousRecruiter: null,
        newRecruiter: null,
        ledgerEventId: null,
        ownershipVersionAfter: null,
        lifecycleFieldsChanged: [],
      });
      stoppedEarly = true;
      stopReason = `Workflow missing for ${member.candidateId}`;
      break;
    }

    if (!isUnassignedRecruiter(wf.assignedRecruiter)) {
      failed += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: false,
        detail: `Expected Unassigned, found ${wf.assignedRecruiter}`,
        previousRecruiter: wf.assignedRecruiter,
        newRecruiter: null,
        ledgerEventId: null,
        ownershipVersionAfter: null,
        lifecycleFieldsChanged: [],
      });
      stoppedEarly = true;
      stopReason = "Pre-check failed: recruiter no longer Unassigned";
      break;
    }

    const version = wf.recruiterOwnershipVersion ?? 0;
    if (version !== member.expectedOwnershipVersion) {
      staleConflicts += 1;
      failed += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: false,
        detail: `Stale ownership version expected=${member.expectedOwnershipVersion} got=${version}`,
        previousRecruiter: wf.assignedRecruiter,
        newRecruiter: null,
        ledgerEventId: null,
        ownershipVersionAfter: null,
        lifecycleFieldsChanged: [],
      });
      stoppedEarly = true;
      stopReason = "Stale version conflict";
      break;
    }

    const beforeSnapshot = Object.fromEntries(
      LIFECYCLE_FIELDS.map((k) => [k, (wf as Record<string, unknown>)[k] ?? null]),
    );

    try {
      const updated = await upsertCandidateWorkflow({
        candidateId: member.candidateId,
        assignedRecruiter: member.proposedRecruiter,
        recruiterAssignmentSource: "operator_confirmed_historical_restore",
        recruiterAssignmentReason:
          "P188.5 ten-candidate operator-confirmed historical restore canary",
        recruiterAssignmentConfidence: 100,
        expectedOwnershipVersion: member.expectedOwnershipVersion,
        expectedRecruiter: "Unassigned",
        allowForceOverwrite: true,
        audit: {
          action: "p188_5_operator_confirmed_historical_restore",
          byUserId: input.authorization.actor,
          metadata: {
            cohortId: input.cohort.cohortId,
            fingerprint: input.cohort.fingerprint,
            idempotencyKey: member.idempotencyKey,
            evidenceReference: member.evidenceReference,
            rollbackReference: member.rollbackReference,
          },
        },
      });

      const lifecycleFieldsChanged = LIFECYCLE_FIELDS.filter(
        (k) => String((updated as Record<string, unknown>)[k] ?? null) !== String(beforeSnapshot[k]),
      );

      if (lifecycleFieldsChanged.length > 0) {
        failed += 1;
        attempts.push({
          candidateId: member.candidateId,
          ok: false,
          detail: `Unrelated lifecycle fields changed: ${lifecycleFieldsChanged.join(",")}`,
          previousRecruiter: wf.assignedRecruiter,
          newRecruiter: updated.assignedRecruiter,
          ledgerEventId: null,
          ownershipVersionAfter: updated.recruiterOwnershipVersion ?? null,
          lifecycleFieldsChanged,
        });
        stoppedEarly = true;
        stopReason = "Unrelated lifecycle field changed";
        break;
      }

      if (updated.assignedRecruiter !== member.proposedRecruiter) {
        failed += 1;
        attempts.push({
          candidateId: member.candidateId,
          ok: false,
          detail: `Persist mismatch: expected ${member.proposedRecruiter} got ${updated.assignedRecruiter}`,
          previousRecruiter: wf.assignedRecruiter,
          newRecruiter: updated.assignedRecruiter,
          ledgerEventId: null,
          ownershipVersionAfter: updated.recruiterOwnershipVersion ?? null,
          lifecycleFieldsChanged: [],
        });
        stoppedEarly = true;
        stopReason = "Recruiter value did not persist";
        break;
      }

      // Re-read durable store
      const afterState = await getCandidateWorkflowState();
      const durable = afterState[member.candidateId];
      if (!durable || durable.assignedRecruiter !== member.proposedRecruiter) {
        failed += 1;
        attempts.push({
          candidateId: member.candidateId,
          ok: false,
          detail: "Durable re-read failed to show named recruiter",
          previousRecruiter: wf.assignedRecruiter,
          newRecruiter: durable?.assignedRecruiter ?? null,
          ledgerEventId: null,
          ownershipVersionAfter: durable?.recruiterOwnershipVersion ?? null,
          lifecycleFieldsChanged: [],
        });
        stoppedEarly = true;
        stopReason = "Durable confirmation failed";
        break;
      }

      const ledger = await listOwnershipLedgerForCandidate(member.candidateId, 5);
      const ledgerHit = ledger.find(
        (e) =>
          e.idempotencyKey === member.idempotencyKey ||
          (e.newRecruiter === member.proposedRecruiter &&
            e.source === "operator_confirmed_historical_restore"),
      );
      if (!ledgerHit) {
        failed += 1;
        attempts.push({
          candidateId: member.candidateId,
          ok: false,
          detail: "Ownership ledger event not found after write",
          previousRecruiter: wf.assignedRecruiter,
          newRecruiter: durable.assignedRecruiter,
          ledgerEventId: null,
          ownershipVersionAfter: durable.recruiterOwnershipVersion ?? null,
          lifecycleFieldsChanged: [],
        });
        stoppedEarly = true;
        stopReason = "Ledger append verification failed";
        break;
      }

      ledgerEventsWritten += 1;
      restored += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: true,
        detail: "Restored and durable-confirmed",
        previousRecruiter: "Unassigned",
        newRecruiter: durable.assignedRecruiter,
        ledgerEventId: ledgerHit.id,
        ownershipVersionAfter: durable.recruiterOwnershipVersion ?? null,
        lifecycleFieldsChanged: [],
      });
    } catch (err) {
      failed += 1;
      const detail =
        err instanceof OwnershipConcurrencyError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      if (/version conflict|ownership version/i.test(detail)) staleConflicts += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: false,
        detail,
        previousRecruiter: wf.assignedRecruiter,
        newRecruiter: null,
        ledgerEventId: null,
        ownershipVersionAfter: null,
        lifecycleFieldsChanged: [],
      });
      stoppedEarly = true;
      stopReason = detail;
      break;
    }
  }

  return {
    cohortId: input.cohort.cohortId,
    fingerprint: input.cohort.fingerprint,
    attempted: attempts.length,
    restored,
    failed,
    staleConflicts,
    ledgerEventsWritten,
    stoppedEarly,
    stopReason,
    attempts,
    lifecycleWrites: 0,
    recommendations: 0,
    approvals: 0,
    paperworkSends: 0,
    melWrites: 0,
    recruiterWrites: restored,
  };
}
