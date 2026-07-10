import {
  buildBulkMappingReviewToolsReport,
  loadBulkReviewDryRunContext,
} from "@/lib/p111-bulk-mapping-review/build-bulk-review-report";
import { simulateBulkGroupApprovalImpact } from "@/lib/p112-bulk-approval-impact-validation/simulate-bulk-group-impact";
import type {
  ApprovalSafetyRecommendation,
  BulkApprovalImpactValidationReport,
  BulkGroupImpactSimulation,
} from "@/lib/p112-bulk-approval-impact-validation/types";
import { P112_DEFAULT_MODE, P112_SOURCE_PHASE } from "@/lib/p112-bulk-approval-impact-validation/types";

const RECOMMENDATION_RANK: Record<ApprovalSafetyRecommendation, number> = {
  SAFE: 0,
  "REVIEW FIRST": 1,
  "DO NOT APPROVE": 2,
};

function pickRecommendedFirstGroup(
  simulations: BulkGroupImpactSimulation[],
): BulkApprovalImpactValidationReport["recommendedFirstGroupToApprove"] {
  const eligible = simulations
    .filter((simulation) => simulation.safeToApprove !== "DO NOT APPROVE")
    .sort((left, right) => {
      const rankDiff =
        RECOMMENDATION_RANK[left.safeToApprove] - RECOMMENDATION_RANK[right.safeToApprove];
      if (rankDiff !== 0) return rankDiff;
      if (right.newlyEligibleAfterApproval !== left.newlyEligibleAfterApproval) {
        return right.newlyEligibleAfterApproval - left.newlyEligibleAfterApproval;
      }
      return right.averageConfidence - left.averageConfidence;
    });

  const first = eligible[0];
  if (!first) return null;

  const reason =
    first.safeToApprove === "SAFE"
      ? `Full recovery (${first.newlyEligibleAfterApproval}/${first.candidateCount}) with strong confidence (${first.averageConfidence}%).`
      : `Highest-impact bulk-approvable group with ${first.newlyEligibleAfterApproval} newly eligible; review risk notes before approving.`;

  return {
    groupId: first.groupId,
    groupName: first.groupName,
    candidateCount: first.candidateCount,
    newlyEligibleAfterApproval: first.newlyEligibleAfterApproval,
    safeToApprove: first.safeToApprove,
    reason,
  };
}

function buildGoNoGo(input: {
  safetyOk: boolean;
  bulkApprovableGroups: number;
  estimatedNewlyEligible: number;
  doNotApproveCount: number;
}): { goNoGo: "GO" | "NO-GO"; reason: string } {
  if (!input.safetyOk) {
    return {
      goNoGo: "NO-GO",
      reason: "Safety contract checks failed — bulk approval simulation not cleared.",
    };
  }
  if (input.bulkApprovableGroups === 0) {
    return {
      goNoGo: "NO-GO",
      reason: "No P111 bulk-approvable groups available to simulate.",
    };
  }
  if (input.estimatedNewlyEligible === 0) {
    return {
      goNoGo: "NO-GO",
      reason: "Bulk approval simulation shows zero newly eligible candidates.",
    };
  }
  if (input.doNotApproveCount === input.bulkApprovableGroups) {
    return {
      goNoGo: "NO-GO",
      reason: "All bulk-approvable groups are flagged DO NOT APPROVE.",
    };
  }
  return {
    goNoGo: "GO",
    reason: `${input.estimatedNewlyEligible} candidate(s) would unlock across ${input.bulkApprovableGroups} simulated bulk approvals (dryRun only).`,
  };
}

export async function buildBulkApprovalImpactValidationReport(): Promise<BulkApprovalImpactValidationReport> {
  const warnings = [
    "P112 — dryRun simulation only; no approvals persisted.",
    "P112 — no paperwork sends.",
    "P112 — no Breezy writes.",
    "P112 — P106.3 live runner unchanged.",
    `Mode: ${P112_DEFAULT_MODE}.`,
  ];

  const [p111Report, dryRunContext] = await Promise.all([
    buildBulkMappingReviewToolsReport(),
    loadBulkReviewDryRunContext(),
  ]);

  const bulkApprovableGroups = p111Report.groups.filter((group) => group.bulkApprovable);
  const groupSimulations = bulkApprovableGroups.map((group) =>
    simulateBulkGroupApprovalImpact({
      group,
      dryRunContext,
      totalPendingBefore: p111Report.metrics.totalPendingCandidates,
    }),
  );

  const metrics = {
    totalBulkApprovableGroups: groupSimulations.length,
    totalCandidates: groupSimulations.reduce((sum, group) => sum + group.candidateCount, 0),
    estimatedNewlyEligible: groupSimulations.reduce(
      (sum, group) => sum + group.newlyEligibleAfterApproval,
      0,
    ),
    totalRemainingBlocked: groupSimulations.reduce((sum, group) => sum + group.remainingBlocked, 0),
    exclusions: {
      alreadySent: groupSimulations.reduce((sum, group) => sum + group.safetyExclusions.alreadySent, 0),
      duplicateRisk: groupSimulations.reduce(
        (sum, group) => sum + group.safetyExclusions.duplicateRisk,
        0,
      ),
      invalidEmail: groupSimulations.reduce(
        (sum, group) => sum + group.safetyExclusions.invalidEmail,
        0,
      ),
      other: groupSimulations.reduce((sum, group) => sum + group.safetyExclusions.other, 0),
    },
    recommendations: {
      safe: groupSimulations.filter((group) => group.safeToApprove === "SAFE").length,
      reviewFirst: groupSimulations.filter((group) => group.safeToApprove === "REVIEW FIRST").length,
      doNotApprove: groupSimulations.filter((group) => group.safeToApprove === "DO NOT APPROVE").length,
    },
  };

  const safetyStatus = {
    p1063RunnerUnchanged: true,
    noBreezyWrites: true,
    noLiveSends: true,
    noLiveMode: process.env.AUTONOMOUS_PAPERWORK_RUNNER_LIVE_MODE == null,
    dryRunOnly: true,
    noActualApprovalsPersisted: true,
  };

  const recommendedFirstGroupToApprove = pickRecommendedFirstGroup(groupSimulations);
  const { goNoGo, reason: goNoGoReason } = buildGoNoGo({
    safetyOk: Object.values(safetyStatus).every(Boolean),
    bulkApprovableGroups: metrics.totalBulkApprovableGroups,
    estimatedNewlyEligible: metrics.estimatedNewlyEligible,
    doNotApproveCount: metrics.recommendations.doNotApprove,
  });

  const summary = [
    `${metrics.totalBulkApprovableGroups} bulk-approvable groups (${metrics.totalCandidates} candidates) simulated.`,
    `${metrics.estimatedNewlyEligible} estimated newly eligible, ${metrics.totalRemainingBlocked} remain blocked.`,
    `Recommendations: ${metrics.recommendations.safe} SAFE, ${metrics.recommendations.reviewFirst} REVIEW FIRST, ${metrics.recommendations.doNotApprove} DO NOT APPROVE.`,
    recommendedFirstGroupToApprove
      ? `First recommended group: ${recommendedFirstGroupToApprove.groupName}.`
      : "No group recommended for bulk approval.",
    `${goNoGo}: ${goNoGoReason}`,
  ].join(" ");

  return {
    sourcePhase: P112_SOURCE_PHASE,
    generatedAt: new Date().toISOString(),
    mode: P112_DEFAULT_MODE,
    summary,
    goNoGo,
    goNoGoReason,
    metrics,
    recommendedFirstGroupToApprove,
    groupSimulations: groupSimulations.sort(
      (left, right) =>
        right.newlyEligibleAfterApproval - left.newlyEligibleAfterApproval ||
        right.candidateCount - left.candidateCount,
    ),
    safetyStatus,
    warnings: [...warnings, ...p111Report.warnings],
  };
}
