import { createHash, randomUUID } from "node:crypto";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { P188_1_RECOMMENDED_STAGE } from "@/lib/p188-1-hiring-recommendation-workflow/types";
import {
  P190_AUTH_EXPIRATION_HOURS,
  P190_MAX_APPROVAL_WRITES,
  P190_OPERATOR_APPROVED_STATUS,
  P190_PILOT_SIZE,
  P190_REQUIRED_SOURCE_COHORT_ID,
  P190_REQUIRED_SOURCE_FINGERPRINT,
  P190_SCHEMA_VERSION,
  P190_SOURCE_PHASE,
  type P190Authorization,
  type P190FrozenCohort,
  type P190FrozenCohortMember,
} from "@/lib/p190-operator-approval-pilot/types";

export type P189SourceCohort = {
  cohortId: string;
  fingerprint: string;
  members: Array<{
    candidateId: string;
    recruiter: string;
    jobId: string;
    jobLabel?: string | null;
    city?: string | null;
    state?: string | null;
    expectedOwnershipVersion?: number;
  }>;
};

export function cohortFingerprint(memberIds: string[]): string {
  return createHash("sha256")
    .update([...memberIds].sort().join("|"))
    .digest("hex")
    .slice(0, 24);
}

export function buildApprovalIdempotencyKey(
  candidateId: string,
  cohortId: string,
  productionRecordVersion: string,
): string {
  return createHash("sha256")
    .update(`p190|${cohortId}|${candidateId}|${productionRecordVersion}`)
    .digest("hex")
    .slice(0, 24);
}

export function assertCohortImmutable(
  cohort: P190FrozenCohort,
  candidateId: string,
): void {
  if (!cohort.immutable) throw new Error("Cohort is not marked immutable");
  if (!cohort.members.some((m) => m.candidateId === candidateId)) {
    throw new Error(`Candidate ${candidateId} is outside frozen P190 cohort`);
  }
}

/**
 * Freeze P190 from the exact P189 source cohort only. Verify ID + fingerprint.
 * Does not replace or reorder membership relative to source order for write safety,
 * but fingerprint is order-independent (sorted IDs).
 */
export function freezeP190FromP189Cohort(input: {
  source: P189SourceCohort;
  workflowsById: Map<string, CandidateWorkflowRecord>;
  nowMs?: number;
}): P190FrozenCohort {
  const nowMs = input.nowMs ?? Date.now();
  if (input.source.cohortId !== P190_REQUIRED_SOURCE_COHORT_ID) {
    throw new Error(
      `Refusing freeze: source cohortId ${input.source.cohortId} !== ${P190_REQUIRED_SOURCE_COHORT_ID}`,
    );
  }
  if (input.source.fingerprint !== P190_REQUIRED_SOURCE_FINGERPRINT) {
    throw new Error(
      `Refusing freeze: fingerprint ${input.source.fingerprint} !== ${P190_REQUIRED_SOURCE_FINGERPRINT}`,
    );
  }
  if (input.source.members.length !== P190_PILOT_SIZE) {
    throw new Error(
      `Refusing freeze: expected ${P190_PILOT_SIZE} members, got ${input.source.members.length}`,
    );
  }

  const frozenAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + P190_AUTH_EXPIRATION_HOURS * 3600_000).toISOString();

  const members: P190FrozenCohortMember[] = [];
  for (const src of input.source.members) {
    const wf = input.workflowsById.get(src.candidateId);
    if (!wf) {
      throw new Error(`Missing workflow for source member ${src.candidateId}`);
    }
    if (wf.recommendedStage !== P188_1_RECOMMENDED_STAGE) {
      throw new Error(
        `Source member ${src.candidateId} missing Hiring Recommendation (got ${wf.recommendedStage})`,
      );
    }
    if (!wf.assignedRecruiter || wf.assignedRecruiter === "Unassigned") {
      throw new Error(`Source member ${src.candidateId} missing recruiter ownership`);
    }
    if (wf.assignedRecruiter !== src.recruiter) {
      throw new Error(
        `Recruiter drift at freeze for ${src.candidateId}: store=${wf.assignedRecruiter} source=${src.recruiter}`,
      );
    }
    if (wf.workflowStatus === P190_OPERATOR_APPROVED_STATUS) {
      throw new Error(`Source member ${src.candidateId} already Operator Approved`);
    }
    if (wf.workflowStatus === "Paperwork Needed" || wf.paperworkStatus !== "not_sent") {
      throw new Error(`Source member ${src.candidateId} has paperwork state`);
    }

    const productionRecordVersion = `${wf.updatedAt}:${wf.workflowStatus}:${(wf.history ?? []).length}:${wf.recommendedStage ?? ""}`;
    const provisionalCohortId = "p190-pending";
    members.push({
      candidateId: src.candidateId,
      recruiter: src.recruiter,
      jobId: src.jobId,
      jobLabel: src.jobLabel ?? null,
      city: src.city ?? null,
      state: src.state ?? null,
      currentStage: wf.workflowStatus,
      recommendedStage: wf.recommendedStage,
      expectedNewStage: P190_OPERATOR_APPROVED_STATUS,
      expectedOwnershipVersion: wf.recruiterOwnershipVersion ?? src.expectedOwnershipVersion ?? 0,
      productionRecordVersion,
      idempotencyKey: buildApprovalIdempotencyKey(
        src.candidateId,
        provisionalCohortId,
        productionRecordVersion,
      ),
      rollbackReference: `rollback:p190:${src.candidateId}:pre-oa:${productionRecordVersion}`,
      sourceCohortId: P190_REQUIRED_SOURCE_COHORT_ID,
    });
  }

  const fingerprint = cohortFingerprint(members.map((m) => m.candidateId));
  // Fingerprint must equal P189 fingerprint (same member set)
  if (fingerprint !== P190_REQUIRED_SOURCE_FINGERPRINT) {
    throw new Error(
      `Frozen membership fingerprint ${fingerprint} !== required ${P190_REQUIRED_SOURCE_FINGERPRINT}`,
    );
  }

  const cohortId = `p190-pilot-${createHash("sha256")
    .update(frozenAt + members.map((m) => m.candidateId).join(","))
    .digest("hex")
    .slice(0, 10)}`;

  // Re-bind idempotency keys to final cohort ID
  for (const m of members) {
    m.idempotencyKey = buildApprovalIdempotencyKey(
      m.candidateId,
      cohortId,
      m.productionRecordVersion,
    );
  }

  return {
    cohortId,
    fingerprint,
    sourceCohortId: P190_REQUIRED_SOURCE_COHORT_ID,
    sourceFingerprint: P190_REQUIRED_SOURCE_FINGERPRINT,
    frozenAt,
    expiresAt,
    size: members.length,
    immutable: true,
    members,
    sourcePhase: P190_SOURCE_PHASE,
    schemaVersion: P190_SCHEMA_VERSION,
  };
}

export function newP190Authorization(input: {
  cohort: P190FrozenCohort;
  authorizedBy?: string;
  nowMs?: number;
}): P190Authorization {
  const nowMs = input.nowMs ?? Date.now();
  return {
    cohortId: input.cohort.cohortId,
    fingerprint: input.cohort.fingerprint,
    authorizedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + P190_AUTH_EXPIRATION_HOURS * 3600_000).toISOString(),
    maxWrites: P190_MAX_APPROVAL_WRITES,
    authorizedBy: input.authorizedBy ?? "operator-prompt-p190",
    authorizationToken: `p190-auth-${randomUUID().slice(0, 12)}`,
    allowPaperwork: false,
    allowP184: false,
    allowP187: false,
    allowAutomation: false,
    allowMel: false,
    allowDropboxSign: false,
  };
}

export function redactCohortForPublic(cohort: P190FrozenCohort): unknown {
  return {
    ...cohort,
    members: cohort.members.map((m) => ({
      ...m,
      candidateId: `${m.candidateId.slice(0, 6)}…`,
      rollbackReference: "[redacted]",
      productionRecordVersion: "[redacted]",
    })),
  };
}
