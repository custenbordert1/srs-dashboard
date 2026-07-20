import { createHash } from "node:crypto";
import {
  P214_MAX_COHORT_SIZE,
  P214_PHASE,
  type P214CohortMember,
  type P214CoverageTier,
  type P214FrozenCohort,
} from "@/lib/p214-unsent-test-batch/types";

function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

export type P214SelectableCandidate = {
  candidateId: string;
  normalizedEmail: string;
  positionLabel: string;
  workflowStatus: string;
  coverageTier: P214CoverageTier;
  nearestActiveWorkMiles: number;
  assignedDm: string;
  dmCorrect: boolean;
  hasGeoPosting: boolean;
  /** ISO timestamp of the paperwork-ready approval; oldest first. */
  approvedAt: string;
};

const TIER_ORDER: Record<P214CoverageTier, number> = {
  tier1_0_20: 0,
  tier2_21_39: 1,
  review_40_60: 2,
  out_of_range: 3,
};

/**
 * Priority order per P214: Tier 1 (0–20 mi) before Tier 2 (21–39 mi), then
 * correct DM assignment, then valid geo-specific posting, then oldest
 * approved applicant first. Only tier1/tier2 candidates are selectable.
 */
export function selectP214Cohort(
  eligible: P214SelectableCandidate[],
  maxSize: number = P214_MAX_COHORT_SIZE,
): P214SelectableCandidate[] {
  const selectable = eligible.filter(
    (c) => c.coverageTier === "tier1_0_20" || c.coverageTier === "tier2_21_39",
  );
  const sorted = [...selectable].sort((a, b) => {
    const tierDiff = TIER_ORDER[a.coverageTier] - TIER_ORDER[b.coverageTier];
    if (tierDiff !== 0) return tierDiff;
    if (a.dmCorrect !== b.dmCorrect) return a.dmCorrect ? -1 : 1;
    if (a.hasGeoPosting !== b.hasGeoPosting) return a.hasGeoPosting ? -1 : 1;
    const at = a.approvedAt || "9999";
    const bt = b.approvedAt || "9999";
    if (at !== bt) return at < bt ? -1 : 1;
    return a.candidateId < b.candidateId ? -1 : 1;
  });
  return sorted.slice(0, Math.min(maxSize, P214_MAX_COHORT_SIZE));
}

export function freezeP214Cohort(args: {
  selected: P214SelectableCandidate[];
  authorizedBy: string;
  now?: Date;
  ttlHours?: number;
}): P214FrozenCohort {
  if (args.selected.length > P214_MAX_COHORT_SIZE) {
    throw new Error(
      `P214 cohort cannot exceed ${P214_MAX_COHORT_SIZE} candidates (got ${args.selected.length})`,
    );
  }
  const now = args.now ?? new Date();
  const authorizedAt = now.toISOString();
  const expiresAt = new Date(
    now.getTime() + (args.ttlHours ?? 24) * 3_600_000,
  ).toISOString();
  const memberIds = args.selected.map((c) => c.candidateId).sort();
  const fingerprint = sha256(`p214|${authorizedAt}|${memberIds.join(",")}`);
  const cohortId = `p214-${fingerprint.slice(0, 12)}`;

  const members: P214CohortMember[] = args.selected.map((c) => ({
    candidateId: c.candidateId,
    redactedCandidateId: sha256(c.candidateId).slice(0, 12),
    emailHash: sha256(c.normalizedEmail).slice(0, 16),
    positionLabel: c.positionLabel,
    workflowStatusAtFreeze: c.workflowStatus,
    coverageTier: c.coverageTier,
    nearestActiveWorkMiles: c.nearestActiveWorkMiles,
    assignedDm: c.assignedDm,
    approvedAt: c.approvedAt,
    idempotencyKey: sha256(`p214:${cohortId}:${c.candidateId}`).slice(0, 32),
  }));

  return {
    phase: P214_PHASE,
    cohortId,
    fingerprint,
    authorizedAt,
    expiresAt,
    authorizedBy: args.authorizedBy,
    sendMode: "test_mode",
    maxCohortSize: P214_MAX_COHORT_SIZE,
    members,
  };
}

/** Hard guard: refuse to touch any candidate outside the frozen cohort. */
export function assertP214CohortMember(cohort: P214FrozenCohort, candidateId: string): void {
  if (!cohort.members.some((m) => m.candidateId === candidateId)) {
    throw new Error(
      `P214 refusal: candidate ${sha256(candidateId).slice(0, 12)} is not in frozen cohort ${cohort.cohortId}`,
    );
  }
}
