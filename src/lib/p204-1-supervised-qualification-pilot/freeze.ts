import { createHash, randomUUID } from "node:crypto";
import {
  compositeEvidenceHash,
  questionnaireEvidenceHash,
  resumeEvidenceHash,
} from "@/lib/p204-1-supervised-qualification-pilot/evidence";
import type { P2041EligibleCandidate } from "@/lib/p204-1-supervised-qualification-pilot/select";
import {
  P204_1_AUTH_EXPIRATION_HOURS,
  P204_1_ENGINE_VERSION,
  P204_1_MAX_COHORT,
  P204_1_SCHEMA_VERSION,
  P204_1_SCORING_VERSION,
  P204_1_SOURCE_PHASE,
  P204_1_TERRITORY_DATA_VERSION,
  type P2041Authorization,
  type P2041FrozenCohort,
  type P2041FrozenMember,
} from "@/lib/p204-1-supervised-qualification-pilot/types";

export function cohortFingerprint(memberIds: string[]): string {
  return createHash("sha256")
    .update([...memberIds].sort().join("|"))
    .digest("hex")
    .slice(0, 24);
}

export function assertCohortImmutable(cohort: P2041FrozenCohort, candidateId: string): void {
  if (!cohort.immutable) throw new Error("Cohort is not marked immutable");
  if (!cohort.members.some((m) => m.candidateId === candidateId)) {
    throw new Error(`Candidate ${candidateId} outside frozen ${P204_1_SOURCE_PHASE} cohort`);
  }
}

export function freezeP2041Cohort(input: {
  selected: P2041EligibleCandidate[];
  nowMs?: number;
}): P2041FrozenCohort {
  const nowMs = input.nowMs ?? Date.now();
  if (input.selected.length === 0) {
    throw new Error("Refusing freeze: empty cohort");
  }
  if (input.selected.length > P204_1_MAX_COHORT) {
    throw new Error(
      `Refusing freeze: max ${P204_1_MAX_COHORT}, got ${input.selected.length}`,
    );
  }

  const members: P2041FrozenMember[] = input.selected.map((row) => {
    const questionnaireHash = questionnaireEvidenceHash(row.candidate);
    const resumeHash = resumeEvidenceHash(row.candidate);
    const workflowVersion = Date.parse(row.workflow.updatedAt || "") || 0;
    const ownershipVersion = row.workflow.recruiterOwnershipVersion ?? 0;
    const evidenceHash = compositeEvidenceHash({
      candidateId: row.candidate.candidateId,
      questionnaireHash,
      resumeHash,
      recommendation: row.label,
      confidence: row.decision.confidence,
      workflowVersion,
    });
    return {
      candidateId: row.candidate.candidateId,
      redactedCandidateId: row.decision.redactedCandidateId,
      recommendation: row.label,
      confidence: row.decision.confidence,
      workflowVersion,
      ownershipVersion,
      workflowStatus: row.workflow.workflowStatus,
      paperworkStatus: row.workflow.paperworkStatus ?? null,
      appliedDate: row.candidate.appliedDate ?? "",
      state: row.candidate.state ?? "",
      city: row.candidate.city ?? "",
      positionId: row.candidate.positionId ?? "",
      positionLabel: row.candidate.positionName ?? "",
      questionnaireHash,
      resumeHash,
      evidenceHash,
      sourceTimestamp: row.workflow.updatedAt,
      expectedApplied: true,
    };
  });

  const ids = members.map((m) => m.candidateId);
  const fingerprint = cohortFingerprint(ids);

  return {
    cohortId: `p204-1-${randomUUID().slice(0, 8)}`,
    fingerprint,
    frozenAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + P204_1_AUTH_EXPIRATION_HOURS * 3600_000).toISOString(),
    immutable: true,
    engineVersion: P204_1_ENGINE_VERSION,
    scoringVersion: P204_1_SCORING_VERSION,
    territoryDataVersion: P204_1_TERRITORY_DATA_VERSION,
    schemaVersion: P204_1_SCHEMA_VERSION,
    members,
  };
}

export function newP2041Authorization(input: {
  fingerprint: string;
  actor?: string;
  nowMs?: number;
}): P2041Authorization {
  const nowMs = input.nowMs ?? Date.now();
  return {
    actor: input.actor ?? "p204.1-operator-authorized-prompt",
    authorizedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + P204_1_AUTH_EXPIRATION_HOURS * 3600_000).toISOString(),
    fingerprint: input.fingerprint,
    allowRecommendationWrites: true,
    allowLifecycleWrites: false,
  };
}
