import {
  OwnershipConcurrencyError,
  getCandidateWorkflowState,
  upsertCandidateWorkflow,
} from "@/lib/candidate-workflow-store";
import { isDemoRecruiterName } from "@/lib/production-recruiter-directory";
import type {
  P2032Authorization,
  P2032CleanupAttempt,
  P2032PreviewRow,
} from "@/lib/p203-2-demo-recruiter-ownership-cleanup/types";
import { P203_2_MAX_BATCH } from "@/lib/p203-2-demo-recruiter-ownership-cleanup/types";

const LIFECYCLE_FIELDS = [
  "workflowStatus",
  "recommendedStage",
  "signatureRequestId",
  "paperworkSentAt",
  "paperworkViewedAt",
  "paperworkSignedAt",
] as const;

const PAPERWORK_FIELDS = [
  "paperworkStatus",
  "paperworkTemplateKey",
  "paperworkError",
  "signatureRequestId",
  "paperworkSentAt",
] as const;

export type P2032ExecutionResult = {
  cohortFingerprint: string;
  attempted: number;
  repaired: number;
  failed: number;
  staleConflicts: number;
  skippedAlreadyClean: number;
  stoppedEarly: boolean;
  stopReason: string | null;
  attempts: P2032CleanupAttempt[];
  lifecycleChanges: 0;
  paperworkChanges: 0;
  melWrites: 0;
  notifications: 0;
  automationStarted: 0;
};

export async function executeP2032DemoOwnershipCleanup(input: {
  batch: P2032PreviewRow[];
  authorization: P2032Authorization;
}): Promise<P2032ExecutionResult> {
  const attempts: P2032CleanupAttempt[] = [];
  let repaired = 0;
  let failed = 0;
  let staleConflicts = 0;
  let skippedAlreadyClean = 0;
  let stoppedEarly = false;
  let stopReason: string | null = null;

  if (!input.authorization.allowProductionWrites) {
    return {
      cohortFingerprint: input.authorization.fingerprint,
      attempted: 0,
      repaired: 0,
      failed: 0,
      staleConflicts: 0,
      skippedAlreadyClean: 0,
      stoppedEarly: true,
      stopReason: "Production writes not authorized",
      attempts: [],
      lifecycleChanges: 0,
      paperworkChanges: 0,
      melWrites: 0,
      notifications: 0,
      automationStarted: 0,
    };
  }

  if (Date.parse(input.authorization.expiresAt) < Date.now()) {
    return {
      cohortFingerprint: input.authorization.fingerprint,
      attempted: 0,
      repaired: 0,
      failed: 0,
      staleConflicts: 0,
      skippedAlreadyClean: 0,
      stoppedEarly: true,
      stopReason: "Authorization expired",
      attempts: [],
      lifecycleChanges: 0,
      paperworkChanges: 0,
      melWrites: 0,
      notifications: 0,
      automationStarted: 0,
    };
  }

  const batch = input.batch.slice(0, P203_2_MAX_BATCH);

  for (const member of batch) {
    if (!member.proposedReplacement) {
      failed += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: false,
        detail: "Missing proposed replacement",
        previousRecruiter: member.currentDemoOwner,
        newRecruiter: null,
        ownershipVersionAfter: null,
        lifecycleFieldsChanged: [],
        paperworkFieldsChanged: [],
      });
      continue;
    }

    if (isDemoRecruiterName(member.proposedReplacement)) {
      failed += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: false,
        detail: "Refusing to write demo replacement",
        previousRecruiter: member.currentDemoOwner,
        newRecruiter: null,
        ownershipVersionAfter: null,
        lifecycleFieldsChanged: [],
        paperworkFieldsChanged: [],
      });
      continue;
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
        ownershipVersionAfter: null,
        lifecycleFieldsChanged: [],
        paperworkFieldsChanged: [],
      });
      continue;
    }

    // Idempotent: already repaired
    if (!isDemoRecruiterName(wf.assignedRecruiter)) {
      skippedAlreadyClean += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: true,
        detail: `Already clean (${wf.assignedRecruiter})`,
        previousRecruiter: wf.assignedRecruiter,
        newRecruiter: wf.assignedRecruiter,
        ownershipVersionAfter: wf.recruiterOwnershipVersion ?? null,
        lifecycleFieldsChanged: [],
        paperworkFieldsChanged: [],
      });
      continue;
    }

    if (wf.assignedRecruiter !== member.expectedRecruiter) {
      staleConflicts += 1;
      failed += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: false,
        detail: `Stale recruiter expected=${member.expectedRecruiter} got=${wf.assignedRecruiter}`,
        previousRecruiter: wf.assignedRecruiter,
        newRecruiter: null,
        ownershipVersionAfter: wf.recruiterOwnershipVersion ?? null,
        lifecycleFieldsChanged: [],
        paperworkFieldsChanged: [],
      });
      continue;
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
        ownershipVersionAfter: version,
        lifecycleFieldsChanged: [],
        paperworkFieldsChanged: [],
      });
      continue;
    }

    const beforeLifecycle = Object.fromEntries(
      LIFECYCLE_FIELDS.map((k) => [k, (wf as Record<string, unknown>)[k] ?? null]),
    );
    const beforePaperwork = Object.fromEntries(
      PAPERWORK_FIELDS.map((k) => [k, (wf as Record<string, unknown>)[k] ?? null]),
    );

    try {
      const updated = await upsertCandidateWorkflow({
        candidateId: member.candidateId,
        assignedRecruiter: member.proposedReplacement,
        recruiterAssignmentSource: "operator_restore",
        recruiterAssignmentReason: `P203.2 demo ownership cleanup: ${member.replacementEvidence}`,
        recruiterAssignmentConfidence: member.confidence === "high" ? 95 : 80,
        expectedOwnershipVersion: member.expectedOwnershipVersion,
        expectedRecruiter: member.expectedRecruiter,
        allowForceOverwrite: true,
        audit: {
          action: "p203_2_demo_ownership_cleanup",
          byUserId: input.authorization.actor,
          metadata: {
            fingerprint: input.authorization.fingerprint,
            idempotencyKey: member.idempotencyKey,
            previousDemoOwner: member.currentDemoOwner,
            proposedReplacement: member.proposedReplacement,
            replacementSource: member.replacementSource,
            replacementEvidence: member.replacementEvidence,
            classification: member.classification,
          },
        },
      });

      const lifecycleFieldsChanged = LIFECYCLE_FIELDS.filter(
        (k) => String((updated as Record<string, unknown>)[k] ?? null) !== String(beforeLifecycle[k]),
      );
      const paperworkFieldsChanged = PAPERWORK_FIELDS.filter(
        (k) => String((updated as Record<string, unknown>)[k] ?? null) !== String(beforePaperwork[k]),
      );

      if (lifecycleFieldsChanged.length > 0 || paperworkFieldsChanged.length > 0) {
        failed += 1;
        stoppedEarly = true;
        stopReason = "Lifecycle/paperwork fields changed unexpectedly";
        attempts.push({
          candidateId: member.candidateId,
          ok: false,
          detail: `Unrelated fields changed lifecycle=${lifecycleFieldsChanged.join(",")} paperwork=${paperworkFieldsChanged.join(",")}`,
          previousRecruiter: wf.assignedRecruiter,
          newRecruiter: updated.assignedRecruiter,
          ownershipVersionAfter: updated.recruiterOwnershipVersion ?? null,
          lifecycleFieldsChanged: [...lifecycleFieldsChanged],
          paperworkFieldsChanged: [...paperworkFieldsChanged],
        });
        break;
      }

      if (updated.assignedRecruiter !== member.proposedReplacement) {
        failed += 1;
        attempts.push({
          candidateId: member.candidateId,
          ok: false,
          detail: `Persist mismatch expected=${member.proposedReplacement} got=${updated.assignedRecruiter}`,
          previousRecruiter: wf.assignedRecruiter,
          newRecruiter: updated.assignedRecruiter,
          ownershipVersionAfter: updated.recruiterOwnershipVersion ?? null,
          lifecycleFieldsChanged: [],
          paperworkFieldsChanged: [],
        });
        continue;
      }

      if (isDemoRecruiterName(updated.assignedRecruiter)) {
        failed += 1;
        attempts.push({
          candidateId: member.candidateId,
          ok: false,
          detail: "Post-write still demo-owned",
          previousRecruiter: wf.assignedRecruiter,
          newRecruiter: updated.assignedRecruiter,
          ownershipVersionAfter: updated.recruiterOwnershipVersion ?? null,
          lifecycleFieldsChanged: [],
          paperworkFieldsChanged: [],
        });
        continue;
      }

      repaired += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: true,
        detail: "Repaired",
        previousRecruiter: wf.assignedRecruiter,
        newRecruiter: updated.assignedRecruiter,
        ownershipVersionAfter: updated.recruiterOwnershipVersion ?? null,
        lifecycleFieldsChanged: [],
        paperworkFieldsChanged: [],
      });
    } catch (err) {
      if (err instanceof OwnershipConcurrencyError) {
        staleConflicts += 1;
      }
      failed += 1;
      attempts.push({
        candidateId: member.candidateId,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        previousRecruiter: wf.assignedRecruiter,
        newRecruiter: null,
        ownershipVersionAfter: wf.recruiterOwnershipVersion ?? null,
        lifecycleFieldsChanged: [],
        paperworkFieldsChanged: [],
      });
    }
  }

  return {
    cohortFingerprint: input.authorization.fingerprint,
    attempted: batch.length,
    repaired,
    failed,
    staleConflicts,
    skippedAlreadyClean,
    stoppedEarly,
    stopReason,
    attempts,
    lifecycleChanges: 0,
    paperworkChanges: 0,
    melWrites: 0,
    notifications: 0,
    automationStarted: 0,
  };
}
