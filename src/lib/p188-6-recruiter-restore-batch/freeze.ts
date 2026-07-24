import { createHash, randomUUID } from "node:crypto";
import { isUnassignedRecruiter } from "@/lib/candidate-action-queue";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import type { BreezyCandidate } from "@/lib/breezy-api";
import type { P158AssignmentAuditEvent } from "@/lib/p158-autonomous-recruiter-assignment/types";
import {
  buildRestoreIdempotencyKey,
  buildRestorePreview,
} from "@/lib/p188-4-recruiter-ownership-durability/restorePreview";
import { cohortFingerprint } from "@/lib/p188-5-recruiter-restore-canary/preflight";
import type {
  P1885FrozenCohort,
  P1885FrozenCohortMember,
} from "@/lib/p188-5-recruiter-restore-canary/types";
import {
  P188_6_AUTH_EXPIRATION_HOURS,
  P188_6_BATCH_SIZE,
} from "@/lib/p188-6-recruiter-restore-batch/types";

/**
 * Freeze exactly 50 remaining confirmable candidates, excluding prior canary IDs.
 * Immutable after return — no replacements after freeze.
 */
export async function freezeP1886BatchCohort(input: {
  workflows: CandidateWorkflowRecord[];
  breezyCandidates: BreezyCandidate[];
  p158Events?: P158AssignmentAuditEvent[];
  excludeCandidateIds: string[];
  size?: number;
  nowMs?: number;
}): Promise<P1885FrozenCohort> {
  const nowMs = input.nowMs ?? Date.now();
  const size = input.size ?? P188_6_BATCH_SIZE;
  const frozenAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + P188_6_AUTH_EXPIRATION_HOURS * 3600_000).toISOString();
  const exclude = new Set(input.excludeCandidateIds);

  const preview = await buildRestorePreview({
    workflows: input.workflows,
    breezyCandidates: input.breezyCandidates,
    p158Events: input.p158Events ?? [],
    nowMs,
  });

  const byId = new Map(input.workflows.map((w) => [w.candidateId, w]));
  const members: P1885FrozenCohortMember[] = [];
  const ordered = [...preview.bucketA].sort((a, b) => {
    if (a.jobResolved === b.jobResolved) return 0;
    return a.jobResolved ? -1 : 1;
  });

  for (const item of ordered) {
    if (members.length >= size) break;
    if (exclude.has(item.candidateId)) continue;
    if (item.classification !== "confirmed_restore") continue;
    if (item.bypass) continue;
    if (!item.proposedRecruiter?.trim()) continue;
    if (!item.lastNamedAt || !item.sourceEvent) continue;

    const wf = byId.get(item.candidateId);
    if (!wf) continue;
    if (!isUnassignedRecruiter(wf.assignedRecruiter)) continue;

    members.push({
      candidateId: item.candidateId,
      proposedRecruiter: item.proposedRecruiter,
      evidenceReference: `${item.sourceEvent}@${item.lastNamedAt}`,
      sourceTimestamp: item.lastNamedAt,
      expectedOwnershipVersion: wf.recruiterOwnershipVersion ?? 0,
      expectedRecruiter: "Unassigned",
      idempotencyKey: buildRestoreIdempotencyKey(item.candidateId, item.proposedRecruiter),
      rollbackReference: `rollback:${item.candidateId}:pre-p188.6:${wf.recruiterOwnershipVersion ?? 0}`,
      jobResolved: item.jobResolved,
      workflowStatus: wf.workflowStatus,
      bypass: false,
    });
  }

  const selected = members.slice(0, size);
  if (selected.length !== size) {
    throw new Error(
      `Unable to freeze P188.6 batch of ${size}; only ${selected.length} eligible remaining`,
    );
  }

  const cohortId = `p188.6-batch-${createHash("sha256")
    .update(frozenAt + selected.map((m) => m.candidateId).join(","))
    .digest("hex")
    .slice(0, 10)}`;
  const fingerprint = cohortFingerprint(
    selected.map((m) => m.candidateId),
    selected.map((m) => m.proposedRecruiter),
  );

  return {
    cohortId,
    fingerprint,
    frozenAt,
    expiresAt,
    size: selected.length,
    members: selected,
    immutable: true,
  };
}

export function newP1886Authorization(frozen: P1885FrozenCohort, actor: string) {
  return {
    actor,
    authorizedAt: new Date().toISOString(),
    cohortId: frozen.cohortId,
    fingerprint: frozen.fingerprint,
    maxRecruiterWrites: P188_6_BATCH_SIZE,
    maxLedgerEvents: P188_6_BATCH_SIZE,
    expiresAt: frozen.expiresAt,
    scope: "fifty_candidate_recruiter_ownership_restore_only" as const,
    authorizationToken: `p188.6:${frozen.fingerprint}:${randomUUID().slice(0, 8)}`,
  };
}

export function redactCohortForPublic(frozen: P1885FrozenCohort): unknown {
  return {
    ...frozen,
    members: frozen.members.map((m) => ({
      ...m,
      candidateId: `${m.candidateId.slice(0, 4)}…${m.candidateId.slice(-4)}`,
    })),
  };
}
