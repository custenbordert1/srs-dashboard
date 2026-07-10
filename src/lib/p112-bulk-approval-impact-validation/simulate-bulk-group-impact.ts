import { previewBulkDecisionImpact } from "@/lib/p111-bulk-mapping-review/preview-bulk-impact";
import type { BulkReviewGroup } from "@/lib/p111-bulk-mapping-review/types";
import { recommendGroupApproval } from "@/lib/p112-bulk-approval-impact-validation/recommend-group-approval";
import type { BulkGroupImpactSimulation } from "@/lib/p112-bulk-approval-impact-validation/types";
import type { loadBulkReviewDryRunContext } from "@/lib/p111-bulk-mapping-review/build-bulk-review-report";

type DryRunContext = Awaited<ReturnType<typeof loadBulkReviewDryRunContext>>;

function buildGroupName(group: BulkReviewGroup): string {
  return `${group.closedPositionTitle} → ${group.recommendedPositionTitle ?? "No recommendation"}`;
}

function countRemainingBlocked(
  preview: ReturnType<typeof previewBulkDecisionImpact>,
): number {
  const protectionReasons = new Set(["already_sent", "duplicate_risk", "invalid_email"]);
  return preview.candidateDetails.filter(
    (candidate) =>
      !candidate.wouldBecomeEligible &&
      (!candidate.exclusionReason || !protectionReasons.has(candidate.exclusionReason)),
  ).length;
}

export function simulateBulkGroupApprovalImpact(input: {
  group: BulkReviewGroup;
  dryRunContext: DryRunContext;
  totalPendingBefore: number;
}): BulkGroupImpactSimulation {
  const preview = previewBulkDecisionImpact({
    group: input.group,
    action: "approved",
    sharedNote: "P112 bulk approval impact validation (dryRun simulation only).",
    dryRunContext: input.dryRunContext,
    totalPendingBefore: input.totalPendingBefore,
  });

  const { recommendation, riskNotes } = recommendGroupApproval({
    group: input.group,
    preview,
  });

  const safetyExclusions = {
    alreadySent: preview.safetyExcluded.alreadySent,
    duplicateRisk: preview.safetyExcluded.duplicateRisk,
    invalidEmail: preview.safetyExcluded.invalidEmail,
    other: preview.safetyExcluded.other,
    total:
      preview.safetyExcluded.alreadySent +
      preview.safetyExcluded.duplicateRisk +
      preview.safetyExcluded.invalidEmail +
      preview.safetyExcluded.other,
  };

  const remainingBlocked = countRemainingBlocked(preview);
  const recoveryRatePercent =
    preview.candidatesAffected > 0
      ? Math.round((preview.newlyEligibleAfterApproval / preview.candidatesAffected) * 100)
      : 0;

  return {
    groupId: input.group.groupId,
    groupName: buildGroupName(input.group),
    closedPositionTitle: input.group.closedPositionTitle,
    candidateCount: input.group.candidateCount,
    averageConfidence: input.group.averageConfidence,
    minConfidence: input.group.minConfidence,
    confidenceBand: input.group.confidenceBand,
    recommendedActivePosition: {
      positionId: input.group.recommendedPositionId,
      title: input.group.recommendedPositionTitle,
      city: input.group.city,
      state: input.group.state,
    },
    safetyExclusions,
    newlyEligibleAfterApproval: preview.newlyEligibleAfterApproval,
    remainingBlocked,
    recoveryRatePercent,
    safeToApprove: recommendation,
    riskNotes,
    candidateIds: input.group.candidateIds,
  };
}
