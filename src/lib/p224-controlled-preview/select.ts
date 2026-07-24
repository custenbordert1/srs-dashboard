import { createHash } from "node:crypto";
import type { P214CoverageTier } from "@/lib/p214-unsent-test-batch/types";
import {
  assertP224SelectionSafe,
} from "@/lib/p224-controlled-preview/eligibility";
import {
  P224_EXPECTED_TEMPLATE,
  P224_MAX_COHORT_SIZE,
  P224_PHASE,
  type P224ExclusionReason,
  type P224FrozenPreview,
  type P224PreviewCandidate,
  type P224SelectionAbort,
  type P224SelectionSuccess,
} from "@/lib/p224-controlled-preview/types";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const TIER_ORDER: Record<P214CoverageTier, number> = {
  tier1_0_20: 0,
  tier2_21_39: 1,
  review_40_60: 2,
  out_of_range: 3,
};

/**
 * Priority: Tier 1 before Tier 2, then DM-correct, geo posting, oldest approved.
 * Only tier1/tier2 eligible candidates are selectable.
 */
export function sortP224Eligible(
  eligible: P224PreviewCandidate[],
): P224PreviewCandidate[] {
  return [...eligible].sort((a, b) => {
    const tierDiff = TIER_ORDER[a.coverageTier] - TIER_ORDER[b.coverageTier];
    if (tierDiff !== 0) return tierDiff;
    if (a.dmCorrect !== b.dmCorrect) return a.dmCorrect ? -1 : 1;
    if (a.hasGeoPosting !== b.hasGeoPosting) return a.hasGeoPosting ? -1 : 1;
    const at = a.approvedAt || "9999";
    const bt = b.approvedAt || "9999";
    if (at !== bt) return at < bt ? -1 : 1;
    return a.candidateId < b.candidateId ? -1 : 1;
  });
}

export function selectP224Cohort(
  eligible: P224PreviewCandidate[],
  maxSize: number = P224_MAX_COHORT_SIZE,
): P224PreviewCandidate[] {
  const selectable = eligible.filter(
    (c) =>
      c.eligibilityResult === "eligible" &&
      (c.coverageTier === "tier1_0_20" || c.coverageTier === "tier2_21_39"),
  );
  const sorted = sortP224Eligible(selectable);
  return sorted.slice(0, Math.min(maxSize, P224_MAX_COHORT_SIZE));
}

export function freezeP224Preview(args: {
  selected: P224PreviewCandidate[];
  now?: Date;
}): P224FrozenPreview {
  if (args.selected.length > P224_MAX_COHORT_SIZE) {
    throw new Error(
      `P224 cohort cannot exceed ${P224_MAX_COHORT_SIZE} (got ${args.selected.length})`,
    );
  }
  const now = args.now ?? new Date();
  const authorizedAt = now.toISOString();
  const memberIds = args.selected.map((c) => c.candidateId).sort();
  const fingerprint = sha256(`p224|preview|${authorizedAt}|${memberIds.join(",")}`);
  return {
    phase: P224_PHASE,
    previewOnly: true,
    cohortId: `p224-preview-${fingerprint.slice(0, 12)}`,
    fingerprint: fingerprint.slice(0, 24),
    authorizedAt,
    maxCohortSize: P224_MAX_COHORT_SIZE,
    members: args.selected.map((row) => ({
      ...row,
      expectedTemplate: P224_EXPECTED_TEMPLATE,
    })),
  };
}

export function buildP224SelectionResult(args: {
  evaluatedCount: number;
  eligible: P224PreviewCandidate[];
  exclusionsByReason: Partial<Record<P224ExclusionReason, number>>;
  maxSize?: number;
  now?: Date;
}): P224SelectionSuccess | P224SelectionAbort {
  const maxSize = args.maxSize ?? P224_MAX_COHORT_SIZE;
  const selected = selectP224Cohort(args.eligible, maxSize);

  if (selected.length > maxSize) {
    return {
      aborted: true,
      reason: `more than ${maxSize} candidates would be selected`,
      details: [`selected=${selected.length}`],
    };
  }

  const safety = assertP224SelectionSafe(selected, maxSize);
  if (!safety.ok) {
    return {
      aborted: true,
      reason: safety.reason,
      details: safety.details,
    };
  }

  try {
    const cohort = freezeP224Preview({ selected, now: args.now });
    return {
      aborted: false,
      evaluatedCount: args.evaluatedCount,
      eligibleCount: args.eligible.length,
      selected,
      exclusionsByReason: args.exclusionsByReason,
      cohort,
    };
  } catch (err) {
    return {
      aborted: true,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export function bumpExclusion(
  map: Partial<Record<P224ExclusionReason, number>>,
  reason: P224ExclusionReason,
): void {
  map[reason] = (map[reason] ?? 0) + 1;
}
