import { createHash, randomUUID } from "node:crypto";
import {
  hashCandidateId,
  redactCandidateId,
} from "@/lib/p187-1-canary-cohort-readiness/eligibility";
import {
  P187_1_MAX_COHORT,
  P187_1_TRANSITION,
  type P1871CohortMemberPreview,
  type P1871EligibilityResult,
  type P1871ImmutableCohortPreview,
} from "@/lib/p187-1-canary-cohort-readiness/types";

export function createCanaryId(nowIso = new Date().toISOString()): string {
  const day = nowIso.slice(0, 10).replace(/-/g, "");
  return `p187-1-hr-oa-${day}-${randomUUID().slice(0, 8)}`;
}

export function fingerprintCohortMembers(
  memberIds: readonly string[],
  canaryId: string,
): string {
  const normalized = [...memberIds].map((id) => id.trim()).filter(Boolean).sort();
  return createHash("sha256")
    .update(`${canaryId}|${normalized.join("|")}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Per-candidate final validation before freeze (still no writes).
 */
export function finalValidateMember(
  result: P1871EligibilityResult,
  extras?: {
    conflictingWriterActivity?: boolean;
    schedulerOverlapLikely?: boolean;
    rollbackActionValidated?: boolean;
    auditPathValidated?: boolean;
  },
): { ready: boolean; blockedReasons: string[] } {
  const blocked = [...result.blockedReasons];
  if (!result.eligible) {
    return { ready: false, blockedReasons: blocked };
  }
  if (extras?.conflictingWriterActivity) {
    blocked.push("conflicting writer activity");
  }
  if (extras?.schedulerOverlapLikely) {
    blocked.push("scheduler overlap likely during canary");
  }
  if (extras?.rollbackActionValidated === false) {
    blocked.push("rollback action not validated");
  }
  if (extras?.auditPathValidated === false) {
    blocked.push("audit path not validated");
  }
  // Re-check exact state
  if (result.observation.lifecycleState !== "HIRING_RECOMMENDATION") {
    blocked.push("exact current state not Hiring Recommendation");
  }
  if (!result.observation.recommendationEvidenceRef) {
    blocked.push("recommendation evidence missing at final validation");
  }
  return { ready: blocked.length === 0, blockedReasons: blocked };
}

/**
 * Freeze immutable cohort preview — no authority/approval writes; no replacements after freeze.
 */
export function freezeImmutableCohortPreview(input: {
  eligible: P1871EligibilityResult[];
  canaryId?: string;
  nowIso?: string;
  memberExtras?: Record<
    string,
    {
      conflictingWriterActivity?: boolean;
      schedulerOverlapLikely?: boolean;
      rollbackActionValidated?: boolean;
      auditPathValidated?: boolean;
    }
  >;
}): P1871ImmutableCohortPreview | { ok: false; reason: string; aborted: true } {
  const now = input.nowIso ?? new Date().toISOString();
  const canaryId = input.canaryId ?? createCanaryId(now);

  if (input.eligible.length === 0) {
    return {
      ok: false,
      reason: "No eligible candidates — cannot freeze cohort (standards not lowered)",
      aborted: true,
    };
  }
  if (input.eligible.length > P187_1_MAX_COHORT) {
    return {
      ok: false,
      reason: `Eligible set exceeds max ${P187_1_MAX_COHORT} before slice — caller must select first`,
      aborted: true,
    };
  }

  const members: P1871CohortMemberPreview[] = [];
  const excluded: P1871ImmutableCohortPreview["excluded"] = [];

  for (const row of input.eligible) {
    const final = finalValidateMember(row, input.memberExtras?.[row.candidateId]);
    const redacted = redactCandidateId(row.candidateId);
    if (!final.ready) {
      excluded.push({ redactedCandidateId: redacted, reasons: final.blockedReasons });
      continue;
    }

    const obs = row.observation;
    const idempotencyKey = `p1871:${canaryId}:${hashCandidateId(row.candidateId)}:hr-to-oa`;
    const auditCorrelationId = `p1871-corr-${hashCandidateId(row.candidateId)}-${canaryId.slice(-8)}`;

    members.push({
      redactedCandidateId: redacted,
      candidateIdHash: hashCandidateId(row.candidateId),
      productionRecordVersion: obs.productionRecordVersion,
      currentAuthoritativeState: "Hiring Recommendation",
      p186ExpectedState: "OPERATOR_APPROVED",
      recommendationEvidenceReference: obs.recommendationEvidenceRef!,
      operatorOwner: obs.operatorOwner!,
      jobAssignment: obs.jobAssignmentRef!,
      idempotencyKey,
      auditCorrelationId,
      rollbackState: `restore_legacy_ownership:${obs.workflowStatus}:${obs.productionRecordVersion}`,
      eligibilityTimestamp: now,
      finalValidationBlockedReasons: [],
      ready: true,
    });
  }

  if (members.length === 0) {
    return {
      ok: false,
      reason: "All proposed members blocked at final validation — cohort not frozen",
      aborted: true,
    };
  }

  // Fingerprint uses stable hashes (not raw IDs in artifact surface)
  const cohortFingerprint = fingerprintCohortMembers(
    members.map((m) => m.candidateIdHash),
    canaryId,
  );

  return {
    canaryId,
    transition: P187_1_TRANSITION,
    maxCohort: P187_1_MAX_COHORT,
    frozenAt: now,
    cohortFingerprint,
    members,
    excluded,
    replacementsAllowed: false,
    authorityWritten: false,
    approvalsWritten: false,
  };
}

export function assertCohortImmutable(
  frozen: P1871ImmutableCohortPreview,
  attemptAddHashes: string[],
): { ok: boolean; detail: string } {
  if (attemptAddHashes.some((h) => !frozen.members.some((m) => m.candidateIdHash === h))) {
    return { ok: false, detail: "Replacement/expansion after freeze refused" };
  }
  if (attemptAddHashes.length !== frozen.members.length) {
    return { ok: false, detail: "Cohort size change after freeze refused" };
  }
  return { ok: true, detail: "Immutable" };
}
