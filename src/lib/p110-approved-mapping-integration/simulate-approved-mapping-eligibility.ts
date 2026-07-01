import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { PaperworkByGrade } from "@/lib/candidate-onboarding-engine/types";
import { protectionBlockerOverridesApproval } from "@/lib/p109-project-mapping-review/approval-bridge";
import { classifyPaperworkBlocker } from "@/lib/p106-autonomous-paperwork-engine/classify-paperwork-blocker";
import type { ApprovedMappingResolution, CandidateDryRunResult, DryRunEligibilityOutcome } from "@/lib/p110-approved-mapping-integration/types";
import {
  isProjectMappingBlocker,
  isReadyForSendBlocker,
} from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";

function isMappingGateCleared(category: string): boolean {
  return !isProjectMappingBlocker(category);
}

function classifyOutcome(input: {
  baselineCategory: string;
  overlayCategory: string | null;
  hasApprovedMapping: boolean;
}): DryRunEligibilityOutcome {
  if (protectionBlockerOverridesApproval(input.baselineCategory as never)) {
    if (input.baselineCategory === "already_sent") return "excluded_already_sent";
    if (input.baselineCategory === "duplicate_risk") return "excluded_duplicate_risk";
    if (input.baselineCategory === "invalid_email") return "excluded_invalid_email";
  }

  if (!input.hasApprovedMapping) {
    if (input.baselineCategory === "project_mapping_review") return "needs_recruiter_review";
    return "not_approved";
  }

  if (
    input.overlayCategory &&
    isMappingGateCleared(input.overlayCategory) &&
    isProjectMappingBlocker(input.baselineCategory)
  ) {
    return "newly_eligible_via_approval";
  }

  if (input.overlayCategory && isReadyForSendBlocker(input.overlayCategory)) {
    if (isReadyForSendBlocker(input.baselineCategory)) {
      return "already_eligible_baseline";
    }
  }

  return "still_blocked";
}

export function buildApprovedMappingOverlayJobs(input: {
  jobsByPositionId: Map<string, BreezyJob>;
  closedPositionId: string;
  approved: ApprovedMappingResolution;
  publishedJobs: BreezyJob[];
}): Map<string, BreezyJob> | null {
  const mappedJob = input.publishedJobs.find((j) => j.jobId === input.approved.recommendedPositionId);
  if (!mappedJob) return null;
  const overlay = new Map(input.jobsByPositionId);
  overlay.set(input.closedPositionId, mappedJob);
  return overlay;
}

export function simulateCandidateDryRunEligibility(input: {
  row: ScoredCandidateWorkflowRow;
  onboarding: CandidateOnboardingRecord | null;
  jobsByPositionId: Map<string, BreezyJob>;
  closedJobsByPositionId: Map<string, BreezyJob>;
  publishedJobs: BreezyJob[];
  paperworkByGrade: PaperworkByGrade;
  p100SentIds: Set<string>;
  approvedMapping: ApprovedMappingResolution | null;
  candidateName?: string;
}): CandidateDryRunResult {
  const baseline = classifyPaperworkBlocker({
    row: input.row,
    onboarding: input.onboarding,
    jobsByPositionId: input.jobsByPositionId,
    closedJobsByPositionId: input.closedJobsByPositionId,
    publishedJobs: input.publishedJobs,
    paperworkByGrade: input.paperworkByGrade,
    p100SentIds: input.p100SentIds,
  });

  let overlayBlocker: string | null = null;
  if (input.approvedMapping && input.row.positionId) {
    const overlayJobs = buildApprovedMappingOverlayJobs({
      jobsByPositionId: input.jobsByPositionId,
      closedPositionId: input.row.positionId,
      approved: input.approvedMapping,
      publishedJobs: input.publishedJobs,
    });
    if (overlayJobs) {
      const overlay = classifyPaperworkBlocker({
        row: input.row,
        onboarding: input.onboarding,
        jobsByPositionId: overlayJobs,
        closedJobsByPositionId: input.closedJobsByPositionId,
        publishedJobs: input.publishedJobs,
        paperworkByGrade: input.paperworkByGrade,
        p100SentIds: input.p100SentIds,
      });
      overlayBlocker = overlay.category;
    }
  }

  const outcome = classifyOutcome({
    baselineCategory: baseline.category,
    overlayCategory: overlayBlocker,
    hasApprovedMapping: Boolean(input.approvedMapping?.qualifies),
  });

  return {
    candidateId: input.row.candidateId,
    candidateName:
      input.candidateName ||
      `${input.row.firstName ?? ""} ${input.row.lastName ?? ""}`.trim() ||
      "Unknown",
    closedPositionId: input.row.positionId ?? null,
    baselineBlocker: baseline.category,
    overlayBlocker,
    outcome,
    approvedMapping: input.approvedMapping,
  };
}

export function isNewlyEligibleViaApproval(outcome: DryRunEligibilityOutcome): boolean {
  return outcome === "newly_eligible_via_approval";
}
