import { extractJobSignals } from "@/lib/p108-intelligent-project-mapping/extract-job-signals";
import type { MappingFactorScore } from "@/lib/p108-intelligent-project-mapping/types";
import type { ReviewWorkflowItem } from "@/lib/p109-project-mapping-review/types";
import { evaluateGroupBulkSafety } from "@/lib/p111-bulk-mapping-review/bulk-safety-rules";
import {
  buildBulkGroupId,
  resolveConfidenceBand,
} from "@/lib/p111-bulk-mapping-review/group-review-queue";
import type { BulkReviewGroup } from "@/lib/p111-bulk-mapping-review/types";
import { recommendGroupApproval } from "@/lib/p112-bulk-approval-impact-validation/recommend-group-approval";
import { simulateBulkGroupApprovalImpact } from "@/lib/p112-bulk-approval-impact-validation/simulate-bulk-group-impact";
import { previewBulkDecisionImpact } from "@/lib/p111-bulk-mapping-review/preview-bulk-impact";
import type {
  MissingConfidenceFactor,
  ReviewFirstRecommendedAction,
  SplitDimension,
  SplitRecommendation,
} from "@/lib/p115-review-first-risk-breakdown/types";
import type { loadBulkReviewDryRunContext } from "@/lib/p111-bulk-mapping-review/build-bulk-review-report";

type DryRunContext = Awaited<ReturnType<typeof loadBulkReviewDryRunContext>>;

export function collectMissingConfidenceFactors(members: ReviewWorkflowItem[]): MissingConfidenceFactor[] {
  const byFactor = new Map<string, MissingConfidenceFactor>();

  for (const member of members) {
    for (const factor of member.factorScores) {
      if (factor.matched && factor.points > 0) continue;
      const existing = byFactor.get(factor.factor);
      if (existing) {
        existing.affectedCandidates += 1;
      } else {
        byFactor.set(factor.factor, {
          factor: factor.factor,
          detail: factor.detail,
          affectedCandidates: 1,
          maxPointsAvailable: factor.maxPoints,
        });
      }
    }
  }

  return [...byFactor.values()].sort(
    (left, right) =>
      right.maxPointsAvailable - left.maxPointsAvailable ||
      right.affectedCandidates - left.affectedCandidates,
  );
}

export function explainWhyNotSafe(input: {
  group: BulkReviewGroup;
  riskNotes: string[];
}): { whyNotSafe: string; primaryRiskReason: string } {
  const notes = input.riskNotes;
  if (notes.length > 0) {
    return {
      whyNotSafe: notes.join(" "),
      primaryRiskReason: notes[0] ?? "Borderline bulk-approval confidence profile.",
    };
  }

  if (input.group.averageConfidence < 75) {
    return {
      whyNotSafe: `Average confidence ${input.group.averageConfidence}% is below the 75% SAFE threshold.`,
      primaryRiskReason: `Average confidence ${input.group.averageConfidence}% is below SAFE threshold.`,
    };
  }

  return {
    whyNotSafe: "Group does not meet full-recovery SAFE criteria for bulk approval.",
    primaryRiskReason: "Does not meet SAFE bulk-approval criteria.",
  };
}

export function buildWhatWouldMakeItSafe(input: {
  group: BulkReviewGroup;
  missingFactors: MissingConfidenceFactor[];
  riskNotes: string[];
  remainingBlocked: number;
}): string[] {
  const steps: string[] = [];

  if (input.group.averageConfidence < 75) {
    steps.push(`Raise group average confidence to at least 75% (currently ${input.group.averageConfidence}%).`);
  }
  if (input.group.minConfidence <= 66) {
    steps.push(`Resolve borderline members below ~67% confidence (min ${input.group.minConfidence}%).`);
  }
  if (input.remainingBlocked > 0) {
    steps.push(`Clear ${input.remainingBlocked} non-mapping gate blocker(s) before bulk approval.`);
  }

  for (const factor of input.missingFactors.slice(0, 3)) {
    steps.push(`Improve ${factor.factor.replaceAll("_", " ")}: ${factor.detail} (up to ${factor.maxPointsAvailable} pts).`);
  }

  if (steps.length === 0) {
    steps.push("Confirm mapping with recruiter review, then re-run bulk safety simulation.");
  }

  return steps;
}

function buildSyntheticSubgroup(input: {
  parent: BulkReviewGroup;
  members: ReviewWorkflowItem[];
  safetyByCandidate: Map<string, { passesBulkApprove: boolean; blockers: string[]; baselineBlocker: string }>;
  label: string;
}): BulkReviewGroup {
  const first = input.members[0]!;
  const scores = input.members.map((member) => member.confidenceScore);
  const client = extractJobSignals(first.closedPosition.title).client;
  const confidenceBand = resolveConfidenceBand(Math.min(...scores));
  const safety = evaluateGroupBulkSafety({
    members: input.members,
    safetyByCandidate: input.safetyByCandidate,
  });

  return {
    groupId: buildBulkGroupId({
      closedTitle: `${first.closedPosition.title} [${input.label}]`,
      recommendedPositionId: first.recommendedPosition.positionId,
      city: first.closedPosition.city,
      state: first.closedPosition.state,
      confidenceBand,
      client,
    }),
    closedPositionTitle: first.closedPosition.title,
    closedPositionId: first.closedPosition.positionId,
    recommendedPositionId: first.recommendedPosition.positionId,
    recommendedPositionTitle: first.recommendedPosition.title,
    city: first.closedPosition.city,
    state: first.closedPosition.state,
    confidenceBand,
    client,
    averageConfidence: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
    minConfidence: Math.min(...scores),
    candidateCount: input.members.length,
    candidateIds: input.members.map((member) => member.candidateId),
    members: input.members,
    bulkApprovable: safety.bulkApprovable,
    bulkApproveBlockers: safety.blockers,
    individualReviewOnly: !safety.bulkApprovable,
  };
}

function simulateSubgroup(input: {
  subgroup: BulkReviewGroup;
  dryRunContext: DryRunContext;
  totalPendingBefore: number;
}) {
  return simulateBulkGroupApprovalImpact({
    group: input.subgroup,
    dryRunContext: input.dryRunContext,
    totalPendingBefore: input.totalPendingBefore,
  });
}

function groupMembersBy<T extends string>(
  members: ReviewWorkflowItem[],
  dimension: SplitDimension,
  keyFn: (member: ReviewWorkflowItem) => T,
): Map<T, ReviewWorkflowItem[]> {
  const buckets = new Map<T, ReviewWorkflowItem[]>();
  for (const member of members) {
    const key = keyFn(member);
    const existing = buckets.get(key) ?? [];
    existing.push(member);
    buckets.set(key, existing);
  }
  return buckets;
}

export function proposeGroupSplits(input: {
  group: BulkReviewGroup;
  dryRunContext: DryRunContext;
  totalPendingBefore: number;
  safetyByCandidate: Map<string, { passesBulkApprove: boolean; blockers: string[]; baselineBlocker: string }>;
}): SplitRecommendation[] {
  const recommendations: SplitRecommendation[] = [];
  const { group, members } = { ...input, members: input.group.members };

  const addSplit = (
    splitBy: SplitDimension,
    subgroupLabel: string,
    subgroupMembers: ReviewWorkflowItem[],
  ) => {
    if (subgroupMembers.length === 0 || subgroupMembers.length === members.length) return;

    const subgroup = buildSyntheticSubgroup({
      parent: group,
      members: subgroupMembers,
      safetyByCandidate: input.safetyByCandidate,
      label: subgroupLabel,
    });
    const simulation = simulateSubgroup({
      subgroup,
      dryRunContext: input.dryRunContext,
      totalPendingBefore: input.totalPendingBefore,
    });

    recommendations.push({
      splitBy,
      subgroupLabel,
      candidateCount: subgroupMembers.length,
      candidateIds: subgroupMembers.map((member) => member.candidateId),
      averageConfidence: subgroup.averageConfidence,
      wouldBecomeSafe: simulation.safeToApprove === "SAFE",
      projectedSafeToApprove: simulation.safeToApprove,
      reason:
        simulation.safeToApprove === "SAFE"
          ? `Split by ${splitBy} yields SAFE subgroup (${subgroup.averageConfidence}% avg).`
          : `Split by ${splitBy} remains ${simulation.safeToApprove} (${simulation.riskNotes.join(" ") || "still borderline"}).`,
    });
  };

  const byConfidenceBand = groupMembersBy(members, "confidence_score", (member) =>
    resolveConfidenceBand(member.confidenceScore),
  );
  for (const [band, subgroupMembers] of byConfidenceBand) {
    addSplit("confidence_score", `confidence_band_${band}`, subgroupMembers);
  }

  const highConfidence = members.filter((member) => member.confidenceScore >= 75);
  const borderlineConfidence = members.filter((member) => member.confidenceScore < 75);
  addSplit("confidence_score", "confidence_gte_75", highConfidence);
  addSplit("confidence_score", "confidence_lt_75", borderlineConfidence);

  const byCity = groupMembersBy(members, "city", (member) => member.closedPosition.city.trim().toLowerCase());
  for (const [city, subgroupMembers] of byCity) {
    addSplit("city", city, subgroupMembers);
  }

  const byState = groupMembersBy(members, "state", (member) => member.closedPosition.state.trim().toUpperCase());
  for (const [state, subgroupMembers] of byState) {
    addSplit("state", state, subgroupMembers);
  }

  const byTitle = groupMembersBy(members, "position_title", (member) =>
    member.closedPosition.title.trim().toLowerCase(),
  );
  for (const [title, subgroupMembers] of byTitle) {
    addSplit("position_title", title.slice(0, 48), subgroupMembers);
  }

  const byClient = groupMembersBy(members, "client_project", (member) => {
    const clientFactor = member.factorScores.find((factor) => factor.factor === "client");
    return clientFactor?.matched ? "client_match" : "client_mismatch";
  });
  for (const [clientBucket, subgroupMembers] of byClient) {
    addSplit("client_project", clientBucket, subgroupMembers);
  }

  return recommendations
    .filter(
      (left, index, all) =>
        all.findIndex(
          (right) =>
            right.splitBy === left.splitBy &&
            right.subgroupLabel === left.subgroupLabel &&
            right.candidateIds.join() === left.candidateIds.join(),
        ) === index,
    )
    .sort(
      (left, right) =>
        Number(right.wouldBecomeSafe) - Number(left.wouldBecomeSafe) ||
        right.averageConfidence - left.averageConfidence ||
        right.candidateCount - left.candidateCount,
    );
}

export function recommendReviewFirstAction(input: {
  group: BulkReviewGroup;
  simulation: ReturnType<typeof simulateBulkGroupApprovalImpact>;
  missingFactors: MissingConfidenceFactor[];
  splitRecommendations: SplitRecommendation[];
}): { action: ReviewFirstRecommendedAction; reason: string } {
  const safeSplit = input.splitRecommendations.find((split) => split.wouldBecomeSafe);
  if (safeSplit && safeSplit.candidateCount >= 2) {
    return {
      action: "split_group",
      reason: `${safeSplit.subgroupLabel} subgroup (${safeSplit.candidateCount} candidates) would become SAFE if split by ${safeSplit.splitBy}.`,
    };
  }

  if (safeSplit && safeSplit.candidateCount === 1) {
    return {
      action: "approve_individually",
      reason: `Single high-confidence candidate (${safeSplit.averageConfidence}%) can be approved individually after split.`,
    };
  }

  if (input.simulation.safetyExclusions.total > 0) {
    return {
      action: "request_recruiter_review",
      reason: "Protection exclusions present — requires recruiter review before any approval.",
    };
  }

  if (!input.group.bulkApprovable) {
    return {
      action: "request_recruiter_review",
      reason: `Bulk safety blockers: ${input.group.bulkApproveBlockers.join("; ")}.`,
    };
  }

  if (input.group.candidateCount === 1) {
    return {
      action: "approve_individually",
      reason: "Single-candidate group — individual review safer than bulk approve.",
    };
  }

  const seriousMismatch = input.missingFactors.some(
    (factor) =>
      (factor.factor === "client" || factor.factor === "project_code") &&
      factor.affectedCandidates === input.group.candidateCount,
  );
  if (seriousMismatch && input.group.averageConfidence < 70) {
    return {
      action: "reject_group",
      reason: "Persistent client/project mismatch with borderline confidence — consider rejecting mapping.",
    };
  }

  if (input.group.averageConfidence < 68) {
    return {
      action: "request_recruiter_review",
      reason: `Borderline confidence (${input.group.averageConfidence}%) — recruiter should validate mapping before approval.`,
    };
  }

  if (input.splitRecommendations.some((split) => split.wouldBecomeSafe)) {
    return {
      action: "split_group",
      reason: "A splittable SAFE subgroup exists — split before bulk approval.",
    };
  }

  return {
    action: "approve_individually",
    reason: "Full recovery expected but confidence is borderline — approve candidates individually after review.",
  };
}

export function summarizePrimaryRiskFromFactors(missingFactors: MissingConfidenceFactor[]): string | null {
  const top = missingFactors[0];
  if (!top) return null;
  return `Missing ${top.factor.replaceAll("_", " ")}: ${top.detail}`;
}

export function previewGroupRecovery(input: {
  group: BulkReviewGroup;
  dryRunContext: DryRunContext;
  totalPendingBefore: number;
}) {
  const preview = previewBulkDecisionImpact({
    group: input.group,
    action: "approved",
    sharedNote: "P115 review-first risk analysis (dryRun only).",
    dryRunContext: input.dryRunContext,
    totalPendingBefore: input.totalPendingBefore,
  });
  const { riskNotes } = recommendGroupApproval({ group: input.group, preview });
  const protectionReasons = new Set(["already_sent", "duplicate_risk", "invalid_email"]);
  const remainingBlocked = preview.candidateDetails.filter(
    (candidate) =>
      !candidate.wouldBecomeEligible &&
      (!candidate.exclusionReason || !protectionReasons.has(candidate.exclusionReason)),
  ).length;

  return { preview, riskNotes, remainingBlocked };
}

export function aggregateFactorGaps(factors: MappingFactorScore[]): string[] {
  return factors.filter((factor) => !factor.matched || factor.points <= 0).map((factor) => factor.detail);
}
