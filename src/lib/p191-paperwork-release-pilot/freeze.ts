import { createHash, randomUUID } from "node:crypto";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import { P190_OPERATOR_APPROVED_STATUS } from "@/lib/p190-operator-approval-pilot/types";
import {
  P191_AUTH_EXPIRATION_HOURS,
  P191_MAX_SENDS,
  P191_PAPERWORK_NEEDED_STATUS,
  P191_PILOT_SIZE,
  P191_REQUIRED_SOURCE_COHORT_ID,
  P191_REQUIRED_SOURCE_FINGERPRINT,
  P191_SCHEMA_VERSION,
  P191_SOURCE_PHASE,
  type P191Authorization,
  type P191FrozenCohort,
  type P191FrozenCohortMember,
} from "@/lib/p191-paperwork-release-pilot/types";

export type P190SourceCohort = {
  cohortId: string;
  fingerprint: string;
  members: Array<{
    candidateId: string;
    recruiter: string;
    jobId: string;
    jobLabel?: string | null;
    city?: string | null;
    state?: string | null;
    recommendedStage?: string | null;
    expectedOwnershipVersion?: number;
  }>;
};

export function cohortFingerprint(memberIds: string[]): string {
  return createHash("sha256")
    .update([...memberIds].sort().join("|"))
    .digest("hex")
    .slice(0, 24);
}

export function buildPaperworkIdempotencyKey(
  candidateId: string,
  cohortId: string,
  jobId: string,
): string {
  return createHash("sha256")
    .update(`p191|${cohortId}|${candidateId}|onboarding_packet|${jobId}`)
    .digest("hex")
    .slice(0, 24);
}

export function assertCohortImmutable(
  cohort: P191FrozenCohort,
  candidateId: string,
): void {
  if (!cohort.immutable) throw new Error("Cohort is not marked immutable");
  if (!cohort.members.some((m) => m.candidateId === candidateId)) {
    throw new Error(`Candidate ${candidateId} is outside frozen P191 cohort`);
  }
}

/**
 * Freeze P191 from exact P190 source cohort. Verify ID + fingerprint.
 */
export function freezeP191FromP190Cohort(input: {
  source: P190SourceCohort;
  workflowsById: Map<string, CandidateWorkflowRecord>;
  nowMs?: number;
}): P191FrozenCohort {
  const nowMs = input.nowMs ?? Date.now();
  if (input.source.cohortId !== P191_REQUIRED_SOURCE_COHORT_ID) {
    throw new Error(
      `Refusing freeze: source cohortId ${input.source.cohortId} !== ${P191_REQUIRED_SOURCE_COHORT_ID}`,
    );
  }
  if (input.source.fingerprint !== P191_REQUIRED_SOURCE_FINGERPRINT) {
    throw new Error(
      `Refusing freeze: fingerprint ${input.source.fingerprint} !== ${P191_REQUIRED_SOURCE_FINGERPRINT}`,
    );
  }
  if (input.source.members.length !== P191_PILOT_SIZE) {
    throw new Error(
      `Refusing freeze: expected ${P191_PILOT_SIZE} members, got ${input.source.members.length}`,
    );
  }

  const frozenAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + P191_AUTH_EXPIRATION_HOURS * 3600_000).toISOString();
  const members: P191FrozenCohortMember[] = [];

  for (const src of input.source.members) {
    const wf = input.workflowsById.get(src.candidateId);
    if (!wf) throw new Error(`Missing workflow for ${src.candidateId}`);
    if (wf.workflowStatus !== P190_OPERATOR_APPROVED_STATUS) {
      throw new Error(
        `Source member ${src.candidateId} not Operator Approved (got ${wf.workflowStatus})`,
      );
    }
    if (!wf.assignedRecruiter || wf.assignedRecruiter === "Unassigned") {
      throw new Error(`Missing recruiter for ${src.candidateId}`);
    }
    if (wf.assignedRecruiter !== src.recruiter) {
      throw new Error(
        `Recruiter drift at freeze for ${src.candidateId}: store=${wf.assignedRecruiter} source=${src.recruiter}`,
      );
    }
    if (wf.signatureRequestId || wf.paperworkSentAt || wf.paperworkStatus !== "not_sent") {
      throw new Error(`Paperwork already exists for ${src.candidateId}`);
    }

    const productionRecordVersion = `${wf.updatedAt}:${wf.workflowStatus}:${(wf.history ?? []).length}:${wf.recommendedStage ?? ""}`;
    members.push({
      candidateId: src.candidateId,
      recruiter: src.recruiter,
      jobId: src.jobId,
      jobLabel: src.jobLabel ?? null,
      city: src.city ?? null,
      state: src.state ?? null,
      currentStage: wf.workflowStatus,
      recommendedStage: wf.recommendedStage ?? src.recommendedStage ?? null,
      expectedNewStage: P191_PAPERWORK_NEEDED_STATUS,
      expectedOwnershipVersion: wf.recruiterOwnershipVersion ?? src.expectedOwnershipVersion ?? 0,
      productionRecordVersion,
      idempotencyKey: "pending",
      rollbackReference: `rollback:p191:${src.candidateId}:pre-pn:${productionRecordVersion}`,
      sourceCohortId: P191_REQUIRED_SOURCE_COHORT_ID,
    });
  }

  const fingerprint = cohortFingerprint(members.map((m) => m.candidateId));
  if (fingerprint !== P191_REQUIRED_SOURCE_FINGERPRINT) {
    throw new Error(
      `Frozen membership fingerprint ${fingerprint} !== required ${P191_REQUIRED_SOURCE_FINGERPRINT}`,
    );
  }

  const cohortId = `p191-pilot-${createHash("sha256")
    .update(frozenAt + members.map((m) => m.candidateId).join(","))
    .digest("hex")
    .slice(0, 10)}`;

  for (const m of members) {
    m.idempotencyKey = buildPaperworkIdempotencyKey(m.candidateId, cohortId, m.jobId);
  }

  return {
    cohortId,
    fingerprint,
    sourceCohortId: P191_REQUIRED_SOURCE_COHORT_ID,
    sourceFingerprint: P191_REQUIRED_SOURCE_FINGERPRINT,
    frozenAt,
    expiresAt,
    size: members.length,
    immutable: true,
    members,
    sourcePhase: P191_SOURCE_PHASE,
    schemaVersion: P191_SCHEMA_VERSION,
  };
}

export function newP191Authorization(input: {
  cohort: P191FrozenCohort;
  authorizedBy?: string;
  nowMs?: number;
}): P191Authorization {
  const nowMs = input.nowMs ?? Date.now();
  return {
    cohortId: input.cohort.cohortId,
    fingerprint: input.cohort.fingerprint,
    authorizedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + P191_AUTH_EXPIRATION_HOURS * 3600_000).toISOString(),
    maxSends: P191_MAX_SENDS,
    authorizedBy: input.authorizedBy ?? "operator-prompt-p191",
    authorizationToken: `p191-auth-${randomUUID().slice(0, 12)}`,
    allowContinuousAutomation: false,
    allowScheduler: false,
    allowP187: false,
    allowMel: false,
    allowOutsideCohort: false,
  };
}

export function redactCohortForPublic(cohort: P191FrozenCohort): unknown {
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
