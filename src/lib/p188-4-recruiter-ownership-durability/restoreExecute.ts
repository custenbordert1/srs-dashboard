import {
  OwnershipConcurrencyError,
  upsertCandidateWorkflow,
} from "@/lib/candidate-workflow-store";
import { getCandidateWorkflowState } from "@/lib/candidate-workflow-store";
import { readP1884Flags } from "@/lib/p188-4-recruiter-ownership-durability/flags";
import { buildRestoreIdempotencyKey } from "@/lib/p188-4-recruiter-ownership-durability/restorePreview";
import {
  P188_4_RESTORE_BATCH_MAX,
  type P1884RestorePreviewItem,
} from "@/lib/p188-4-recruiter-ownership-durability/types";

export type P1884RestoreCandidateRequest = {
  candidateId: string;
  proposedRecruiter: string;
  expectedOwnershipVersion?: number;
  expectedRecruiter?: string;
  evidenceReference?: string | null;
};

export type P1884RestoreBatchResult = {
  ok: boolean;
  executed: boolean;
  previewOnly: boolean;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: Array<{
    candidateId: string;
    ok: boolean;
    detail: string;
    previousRecruiter: string | null;
    newRecruiter: string | null;
  }>;
  lifecycleWrites: 0;
  recommendations: 0;
  approvals: 0;
  paperworkSends: 0;
  melWrites: 0;
  rollbackGuidance: string;
};

/**
 * Controlled ownership restore. Default: preview / refused without flags + authorization.
 * Updates recruiter ownership only.
 */
export async function executeOwnershipRestoreBatch(input: {
  candidates: P1884RestoreCandidateRequest[];
  actor: string;
  actorRole: string;
  reason: string;
  operatorAuthorizationToken?: string | null;
  allowProductionWrites?: boolean;
  forceFlags?: { restoreExecution?: boolean };
}): Promise<P1884RestoreBatchResult> {
  const flags = readP1884Flags(
    input.forceFlags ? { restoreExecution: input.forceFlags.restoreExecution } : undefined,
  );

  const base: P1884RestoreBatchResult = {
    ok: false,
    executed: false,
    previewOnly: true,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    results: [],
    lifecycleWrites: 0,
    recommendations: 0,
    approvals: 0,
    paperworkSends: 0,
    melWrites: 0,
    rollbackGuidance:
      "Use ownership ledger rollbackReference / prior version; restore previousRecruiter only. Do not cascade lifecycle.",
  };

  if (!flags.restoreExecution) {
    return {
      ...base,
      results: [
        {
          candidateId: "*",
          ok: false,
          detail: "P188_OWNERSHIP_RESTORE_EXECUTION flag is off — preview only",
          previousRecruiter: null,
          newRecruiter: null,
        },
      ],
    };
  }
  if (!input.allowProductionWrites) {
    return {
      ...base,
      results: [
        {
          candidateId: "*",
          ok: false,
          detail: "allowProductionWrites is false — preview only",
          previousRecruiter: null,
          newRecruiter: null,
        },
      ],
    };
  }
  if (!input.operatorAuthorizationToken?.trim()) {
    return {
      ...base,
      results: [
        {
          candidateId: "*",
          ok: false,
          detail: "Operator authorization token required",
          previousRecruiter: null,
          newRecruiter: null,
        },
      ],
    };
  }
  if (input.candidates.length > P188_4_RESTORE_BATCH_MAX) {
    return {
      ...base,
      results: [
        {
          candidateId: "*",
          ok: false,
          detail: `Batch exceeds max ${P188_4_RESTORE_BATCH_MAX}`,
          previousRecruiter: null,
          newRecruiter: null,
        },
      ],
    };
  }

  const workflows = await getCandidateWorkflowState();
  const results: P1884RestoreBatchResult["results"] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const req of input.candidates) {
    const wf = workflows[req.candidateId];
    if (!wf) {
      failed += 1;
      results.push({
        candidateId: req.candidateId,
        ok: false,
        detail: "Workflow missing",
        previousRecruiter: null,
        newRecruiter: null,
      });
      continue;
    }
    if (wf.assignedRecruiter === req.proposedRecruiter) {
      skipped += 1;
      results.push({
        candidateId: req.candidateId,
        ok: true,
        detail: `Idempotent skip — already ${req.proposedRecruiter}`,
        previousRecruiter: wf.assignedRecruiter,
        newRecruiter: req.proposedRecruiter,
      });
      continue;
    }

    try {
      const updated = await upsertCandidateWorkflow({
        candidateId: req.candidateId,
        assignedRecruiter: req.proposedRecruiter,
        recruiterAssignmentSource: "operator_restore",
        recruiterAssignmentReason: input.reason,
        recruiterAssignmentConfidence: 100,
        expectedOwnershipVersion: req.expectedOwnershipVersion ?? wf.recruiterOwnershipVersion ?? 0,
        expectedRecruiter: req.expectedRecruiter ?? wf.assignedRecruiter,
        allowForceOverwrite: true,
        audit: {
          action: "p188_4_operator_restore",
          byUserId: input.actor,
          metadata: {
            idempotencyKey: buildRestoreIdempotencyKey(req.candidateId, req.proposedRecruiter),
            evidence: req.evidenceReference ?? "",
            actorRole: input.actorRole,
          },
        },
      });
      succeeded += 1;
      results.push({
        candidateId: req.candidateId,
        ok: true,
        detail: "Restored",
        previousRecruiter: wf.assignedRecruiter,
        newRecruiter: updated.assignedRecruiter,
      });
    } catch (err) {
      failed += 1;
      const detail =
        err instanceof OwnershipConcurrencyError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      results.push({
        candidateId: req.candidateId,
        ok: false,
        detail,
        previousRecruiter: wf.assignedRecruiter,
        newRecruiter: null,
      });
      // Stop on systemic concurrency storm? Keep partial success; caller may stop canary.
    }
  }

  return {
    ok: failed === 0,
    executed: true,
    previewOnly: false,
    attempted: input.candidates.length,
    succeeded,
    failed,
    skipped,
    results,
    lifecycleWrites: 0,
    recommendations: 0,
    approvals: 0,
    paperworkSends: 0,
    melWrites: 0,
    rollbackGuidance: base.rollbackGuidance,
  };
}

/** Preview-only packaging for canary candidates from bucket A. */
export function packageRestoreCanary(
  bucketA: P1884RestorePreviewItem[],
  size = 10,
): P1884RestoreCandidateRequest[] {
  return bucketA
    .filter((r) => r.proposedRecruiter && !r.bypass)
    .slice(0, size)
    .map((r) => ({
      candidateId: r.candidateId,
      proposedRecruiter: r.proposedRecruiter!,
      expectedRecruiter: r.currentRecruiter,
      evidenceReference: r.sourceEvent,
    }));
}
