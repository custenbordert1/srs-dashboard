import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { PaperworkByGrade } from "@/lib/candidate-onboarding-engine/types";
import type { ReviewWorkflowItem } from "@/lib/p109-project-mapping-review/types";
import type { ApprovedMappingResolution } from "@/lib/p110-approved-mapping-integration/types";
import {
  isNewlyEligibleViaApproval,
  simulateCandidateDryRunEligibility,
} from "@/lib/p110-approved-mapping-integration/simulate-approved-mapping-eligibility";
import type { BulkImpactPreview, BulkReviewGroup } from "@/lib/p111-bulk-mapping-review/types";
import type { P109ReviewDecision } from "@/lib/p109-project-mapping-review/types";

function buildSyntheticApproval(item: ReviewWorkflowItem): ApprovedMappingResolution | null {
  if (!item.recommendedPosition.positionId) return null;
  return {
    qualifies: true,
    candidateId: item.candidateId,
    closedPositionId: item.closedPosition.positionId,
    recommendedPositionId: item.recommendedPosition.positionId,
    recommendedPositionTitle: item.recommendedPosition.title,
    confidenceScore: item.confidenceScore,
    reviewer: "bulk-preview",
    timestamp: new Date().toISOString(),
    mappingReasons: item.mappingReasons,
    reason: "P111 bulk approval dry-run preview.",
  };
}

export function previewBulkDecisionImpact(input: {
  group: BulkReviewGroup;
  action: P109ReviewDecision;
  sharedNote: string;
  dryRunContext: {
    rowsByCandidateId: Map<string, ScoredCandidateWorkflowRow>;
    onboardingByCandidate: Map<string, CandidateOnboardingRecord>;
    jobsByPositionId: Map<string, BreezyJob>;
    closedJobsByPositionId: Map<string, BreezyJob>;
    publishedJobs: BreezyJob[];
    paperworkByGrade: PaperworkByGrade;
    p100SentIds: Set<string>;
  };
  totalPendingBefore: number;
}): BulkImpactPreview {
  const candidateDetails: BulkImpactPreview["candidateDetails"] = [];
  let newlyEligible = 0;
  const safetyExcluded = { alreadySent: 0, duplicateRisk: 0, invalidEmail: 0, other: 0 };

  for (const item of input.group.members) {
    const row = input.dryRunContext.rowsByCandidateId.get(item.candidateId);
    if (!row) {
      candidateDetails.push({
        candidateId: item.candidateId,
        candidateName: item.candidateName,
        wouldBecomeEligible: false,
        exclusionReason: "Candidate row not found",
      });
      safetyExcluded.other += 1;
      continue;
    }

    const approved =
      input.action === "approved" ? buildSyntheticApproval(item) : null;

    const result = simulateCandidateDryRunEligibility({
      row,
      onboarding: input.dryRunContext.onboardingByCandidate.get(item.candidateId) ?? null,
      jobsByPositionId: input.dryRunContext.jobsByPositionId,
      closedJobsByPositionId: input.dryRunContext.closedJobsByPositionId,
      publishedJobs: input.dryRunContext.publishedJobs,
      paperworkByGrade: input.dryRunContext.paperworkByGrade,
      p100SentIds: input.dryRunContext.p100SentIds,
      approvedMapping: approved,
      candidateName: item.candidateName,
    });

    const wouldBecomeEligible =
      input.action === "approved" && isNewlyEligibleViaApproval(result.outcome);

    if (wouldBecomeEligible) newlyEligible += 1;

    let exclusionReason: string | null = null;
    if (result.outcome === "excluded_already_sent") {
      safetyExcluded.alreadySent += 1;
      exclusionReason = "already_sent";
    } else if (result.outcome === "excluded_duplicate_risk") {
      safetyExcluded.duplicateRisk += 1;
      exclusionReason = "duplicate_risk";
    } else if (result.outcome === "excluded_invalid_email") {
      safetyExcluded.invalidEmail += 1;
      exclusionReason = "invalid_email";
    } else if (input.action === "approved" && !wouldBecomeEligible) {
      safetyExcluded.other += 1;
      exclusionReason = result.baselineBlocker;
    }

    candidateDetails.push({
      candidateId: item.candidateId,
      candidateName: item.candidateName,
      wouldBecomeEligible,
      exclusionReason,
    });
  }

  return {
    groupId: input.group.groupId,
    action: input.action,
    sharedNote: input.sharedNote,
    candidatesAffected: input.group.candidateCount,
    newlyEligibleAfterApproval: newlyEligible,
    safetyExcluded,
    remainingPending: Math.max(0, input.totalPendingBefore - input.group.candidateCount),
    candidateDetails,
  };
}
