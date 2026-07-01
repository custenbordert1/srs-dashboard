import type { BulkImpactPreview, BulkReviewGroup } from "@/lib/p111-bulk-mapping-review/types";
import type { ApprovalSafetyRecommendation } from "@/lib/p112-bulk-approval-impact-validation/types";

const PROTECTION_REASONS = new Set(["already_sent", "duplicate_risk", "invalid_email"]);

function countRemainingBlocked(preview: BulkImpactPreview): number {
  return preview.candidateDetails.filter(
    (candidate) =>
      !candidate.wouldBecomeEligible &&
      (!candidate.exclusionReason || !PROTECTION_REASONS.has(candidate.exclusionReason)),
  ).length;
}

export function recommendGroupApproval(input: {
  group: BulkReviewGroup;
  preview: BulkImpactPreview;
}): { recommendation: ApprovalSafetyRecommendation; riskNotes: string[] } {
  const riskNotes: string[] = [];
  const { preview, group } = input;

  const protectionExclusions =
    preview.safetyExcluded.alreadySent +
    preview.safetyExcluded.duplicateRisk +
    preview.safetyExcluded.invalidEmail;

  if (protectionExclusions > 0) {
    riskNotes.push(`${protectionExclusions} candidate(s) blocked by protection rules (already_sent, duplicate_risk, or invalid_email).`);
    return { recommendation: "DO NOT APPROVE", riskNotes };
  }

  if (preview.newlyEligibleAfterApproval === 0) {
    riskNotes.push("Approval would not unlock any candidates from the project-mapping gate.");
    return { recommendation: "DO NOT APPROVE", riskNotes };
  }

  const remainingBlocked = countRemainingBlocked(preview);
  if (remainingBlocked > 0) {
    riskNotes.push(`${remainingBlocked} candidate(s) remain blocked after mapping approval (other gates hold).`);
  }

  if (group.minConfidence <= 66) {
    riskNotes.push(`Minimum confidence ${group.minConfidence}% is near the bulk-approve threshold.`);
  }

  if (group.averageConfidence < 70) {
    riskNotes.push(`Average confidence ${group.averageConfidence}% is borderline for bulk approval.`);
  }

  const fullRecovery =
    preview.newlyEligibleAfterApproval === preview.candidatesAffected && remainingBlocked === 0;

  if (
    fullRecovery &&
    protectionExclusions === 0 &&
    (group.confidenceBand === "high_80_plus" || group.averageConfidence >= 75)
  ) {
    return { recommendation: "SAFE", riskNotes };
  }

  if (fullRecovery && protectionExclusions === 0) {
    return { recommendation: "REVIEW FIRST", riskNotes };
  }

  return { recommendation: "REVIEW FIRST", riskNotes };
}
