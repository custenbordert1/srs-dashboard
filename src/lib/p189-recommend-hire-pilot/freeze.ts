import { createHash, randomUUID } from "node:crypto";
import type { CandidateWorkflowRecord } from "@/lib/candidate-workflow-types";
import {
  buildCandidateContextFromWorkflow,
  validateRecommendHire,
} from "@/lib/p188-1-hiring-recommendation-workflow";
import {
  P189_AUTH_EXPIRATION_HOURS,
  P189_MAX_RECOMMEND_HIRE_WRITES,
  P189_PILOT_SIZE,
  P189_REASON,
  P189_SCHEMA_VERSION,
  P189_SOURCE_PHASE,
  type P189Authorization,
  type P189FrozenCohort,
  type P189FrozenCohortMember,
} from "@/lib/p189-recommend-hire-pilot/types";

export type P189CandidateEnrichment = {
  jobId: string | null;
  jobLabel: string | null;
  city: string | null;
  state: string | null;
  identityResolved: boolean;
};

export function cohortFingerprint(memberIds: string[]): string {
  return createHash("sha256")
    .update([...memberIds].sort().join("|"))
    .digest("hex")
    .slice(0, 24);
}

export function buildRecommendIdempotencyKey(
  candidateId: string,
  cohortId: string,
  productionRecordVersion: string,
): string {
  return createHash("sha256")
    .update(`p189|${cohortId}|${candidateId}|${productionRecordVersion}`)
    .digest("hex")
    .slice(0, 24);
}

export function assertCohortImmutable(
  cohort: P189FrozenCohort,
  candidateId: string,
): void {
  if (!cohort.immutable) throw new Error("Cohort is not marked immutable");
  if (!cohort.members.some((m) => m.candidateId === candidateId)) {
    throw new Error(`Candidate ${candidateId} is outside frozen P189 cohort`);
  }
}

/**
 * Freeze exactly 25 Recommend Hire–eligible candidates. Immutable after return.
 */
export function freezeP189PilotCohort(input: {
  workflows: CandidateWorkflowRecord[];
  enrichments: Record<string, P189CandidateEnrichment>;
  /** Prefer these IDs first (e.g. prior restore cohorts). */
  preferCandidateIds?: string[];
  size?: number;
  nowMs?: number;
}): P189FrozenCohort {
  const nowMs = input.nowMs ?? Date.now();
  const size = input.size ?? P189_PILOT_SIZE;
  const frozenAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + P189_AUTH_EXPIRATION_HOURS * 3600_000).toISOString();

  const prefer = new Set(input.preferCandidateIds ?? []);
  const eligible: Array<{
    wf: CandidateWorkflowRecord;
    enr: P189CandidateEnrichment;
    score: number;
  }> = [];

  for (const wf of input.workflows) {
    const enr = input.enrichments[wf.candidateId];
    if (!enr?.jobId?.trim()) continue;
    if (!enr.identityResolved) continue;

    const status = wf.workflowStatus;
    if (status !== "Applied" && status !== "Needs Review" && status !== "Qualified") {
      continue;
    }

    const ctx = buildCandidateContextFromWorkflow(wf, wf.candidateId, {
      jobId: enr.jobId,
      jobLabel: enr.jobLabel,
      jobResolved: true,
      identityResolved: enr.identityResolved,
      expectedProductionRecordVersion: undefined,
    });
    // Bind expected version to current production version for CAS freshness.
    ctx.expectedProductionRecordVersion = ctx.productionRecordVersion;

    const validation = validateRecommendHire({
      actor: "p189-operator",
      role: "operator",
      reason: P189_REASON,
      context: ctx,
    });
    if (!validation.eligible) continue;

    eligible.push({
      wf,
      enr,
      score: prefer.has(wf.candidateId) ? 0 : 1,
    });
  }

  eligible.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    // Prefer Applied (matches pilot wording), then stable by id
    const rank = (s: string) =>
      s === "Applied" ? 0 : s === "Needs Review" ? 1 : 2;
    const ra = rank(a.wf.workflowStatus);
    const rb = rank(b.wf.workflowStatus);
    if (ra !== rb) return ra - rb;
    return a.wf.candidateId.localeCompare(b.wf.candidateId);
  });

  if (eligible.length < size) {
    throw new Error(
      `Unable to freeze P189 cohort of ${size}; only ${eligible.length} eligible candidates`,
    );
  }

  const selected = eligible.slice(0, size);
  const provisionalIds = selected.map((s) => s.wf.candidateId);
  const fingerprint = cohortFingerprint(provisionalIds);
  const cohortId = `p189-pilot-${createHash("sha256")
    .update(frozenAt + provisionalIds.join(","))
    .digest("hex")
    .slice(0, 10)}`;

  const members: P189FrozenCohortMember[] = selected.map(({ wf, enr }) => {
    const productionRecordVersion = `${wf.updatedAt}:${wf.workflowStatus}:${(wf.history ?? []).length}:${wf.recommendedStage ?? ""}`;
    return {
      candidateId: wf.candidateId,
      recruiter: wf.assignedRecruiter!,
      jobId: enr.jobId!,
      jobLabel: enr.jobLabel,
      city: enr.city,
      state: enr.state,
      currentStage: wf.workflowStatus,
      expectedNewStage: "Hiring Recommendation",
      productionRecordVersion,
      expectedOwnershipVersion: wf.recruiterOwnershipVersion ?? 0,
      idempotencyKey: buildRecommendIdempotencyKey(
        wf.candidateId,
        cohortId,
        productionRecordVersion,
      ),
      rollbackReference: `rollback:p189:${wf.candidateId}:pre-recommend:${productionRecordVersion}`,
    };
  });

  return {
    cohortId,
    fingerprint,
    frozenAt,
    expiresAt,
    size: members.length,
    immutable: true,
    members,
    sourcePhase: P189_SOURCE_PHASE,
    schemaVersion: P189_SCHEMA_VERSION,
  };
}

export function newP189Authorization(input: {
  cohort: P189FrozenCohort;
  authorizedBy?: string;
  nowMs?: number;
}): P189Authorization {
  const nowMs = input.nowMs ?? Date.now();
  return {
    cohortId: input.cohort.cohortId,
    fingerprint: input.cohort.fingerprint,
    authorizedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + P189_AUTH_EXPIRATION_HOURS * 3600_000).toISOString(),
    maxWrites: P189_MAX_RECOMMEND_HIRE_WRITES,
    authorizedBy: input.authorizedBy ?? "operator-prompt-p189",
    authorizationToken: `p189-auth-${randomUUID().slice(0, 12)}`,
    allowOperatorApproval: false,
    allowPaperwork: false,
    allowP187: false,
    allowAutomation: false,
    allowMel: false,
  };
}

export function redactCohortForPublic(cohort: P189FrozenCohort): unknown {
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
