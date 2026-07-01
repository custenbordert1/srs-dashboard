import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import type { CandidateOnboardingRecord } from "@/lib/candidate-onboarding-engine/types";
import type { PaperworkByGrade } from "@/lib/candidate-onboarding-engine/types";
import type { ClosedAdProjectMappingResult } from "@/lib/closed-ad-project-mapping/types";
import { resolveClosedAdProjectMapping } from "@/lib/closed-ad-project-mapping/resolve-closed-ad-project-mapping";
import { protectionBlockerOverridesApproval } from "@/lib/p109-project-mapping-review/approval-bridge";
import { classifyPaperworkBlocker } from "@/lib/p106-autonomous-paperwork-engine/classify-paperwork-blocker";
import type { PaperworkBlockerCategory } from "@/lib/p106-autonomous-paperwork-engine/types";
import type { ApprovedMappingResolution } from "@/lib/p110-approved-mapping-integration/types";
import { buildApprovedMappingOverlayJobs } from "@/lib/p110-approved-mapping-integration/simulate-approved-mapping-eligibility";
import { isProjectMappingBlocker } from "@/lib/p110-approved-mapping-integration/resolve-approved-mapping";

export type ClassifyPaperworkBlockerInput = {
  row: ScoredCandidateWorkflowRow | null;
  onboarding: CandidateOnboardingRecord | null;
  jobsByPositionId: Map<string, BreezyJob>;
  closedJobsByPositionId?: Map<string, BreezyJob>;
  publishedJobs?: BreezyJob[];
  paperworkByGrade: PaperworkByGrade;
  p100SentIds: Set<string>;
};

export type BridgedClassificationResult = {
  blocker: ReturnType<typeof classifyPaperworkBlocker>;
  baselineBlockerCategory: PaperworkBlockerCategory;
  overlayBlockerCategory: PaperworkBlockerCategory | null;
  bridgeApplied: boolean;
  approvedMappingUsed: boolean;
  protectionBlockedBridge: boolean;
  projectMapping: ClosedAdProjectMappingResult;
};

function resolveBaselineProjectMapping(input: ClassifyPaperworkBlockerInput & { row: ScoredCandidateWorkflowRow }) {
  const published = Boolean(input.row.positionId?.trim() && input.jobsByPositionId.has(input.row.positionId));
  if (published) {
    const job = input.jobsByPositionId.get(input.row.positionId!)!;
    return {
      status: "published" as const,
      confidence: "high" as const,
      passesPublishedJobGate: true,
      sourcePositionId: input.row.positionId,
      mappedPublishedJobId: input.row.positionId,
      mappedProjectName: job.name,
      mappedCity: job.city,
      mappedState: job.state,
      reason: "Published Breezy position.",
    };
  }

  return resolveClosedAdProjectMapping({
    row: input.row,
    positionTitle: input.row.positionName,
    candidateCity: input.row.city,
    candidateState: input.row.state,
    jobsByPositionId: input.jobsByPositionId,
    closedJobsByPositionId: input.closedJobsByPositionId,
    publishedJobs: input.publishedJobs ?? [...input.jobsByPositionId.values()],
  });
}

export function buildBridgedProjectMappingResult(input: {
  row: ScoredCandidateWorkflowRow;
  approved: ApprovedMappingResolution;
  publishedJobs: BreezyJob[];
}): ClosedAdProjectMappingResult {
  const mappedJob = input.publishedJobs.find((job) => job.jobId === input.approved.recommendedPositionId);
  return {
    status: "closed_ad_mapped_project",
    confidence: "high",
    passesPublishedJobGate: true,
    sourcePositionId: input.row.positionId,
    mappedPublishedJobId: input.approved.recommendedPositionId,
    mappedProjectName: mappedJob?.name ?? input.approved.recommendedPositionTitle,
    mappedCity: mappedJob?.city ?? input.row.city,
    mappedState: mappedJob?.state ?? input.row.state,
    reason: `P117 dry-run bridge: P109 approved mapping by ${input.approved.reviewer}.`,
  };
}

export function classifyPaperworkBlockerWithApprovedBridge(input: ClassifyPaperworkBlockerInput & {
  bridgeEnabled: boolean;
  approvedMapping: ApprovedMappingResolution | null;
}): BridgedClassificationResult {
  const baseline = classifyPaperworkBlocker(input);
  const row = input.row;
  const baselineProjectMapping = row
    ? resolveBaselineProjectMapping({ ...input, row })
    : ({
        status: "project_not_mappable",
        confidence: "none",
        passesPublishedJobGate: false,
        sourcePositionId: null,
        mappedPublishedJobId: null,
        mappedProjectName: null,
        mappedCity: null,
        mappedState: null,
        reason: "Missing candidate row.",
      } as ClosedAdProjectMappingResult);

  if (!input.bridgeEnabled || !input.approvedMapping?.qualifies || !row?.positionId) {
    return {
      blocker: baseline,
      baselineBlockerCategory: baseline.category,
      overlayBlockerCategory: null,
      bridgeApplied: false,
      approvedMappingUsed: false,
      protectionBlockedBridge: false,
      projectMapping: baselineProjectMapping,
    };
  }

  if (protectionBlockerOverridesApproval(baseline.category)) {
    return {
      blocker: baseline,
      baselineBlockerCategory: baseline.category,
      overlayBlockerCategory: null,
      bridgeApplied: false,
      approvedMappingUsed: true,
      protectionBlockedBridge: true,
      projectMapping: baselineProjectMapping,
    };
  }

  const publishedJobs = input.publishedJobs ?? [...input.jobsByPositionId.values()];
  const overlayJobs = buildApprovedMappingOverlayJobs({
    jobsByPositionId: input.jobsByPositionId,
    closedPositionId: row.positionId,
    approved: input.approvedMapping,
    publishedJobs,
  });

  if (!overlayJobs) {
    return {
      blocker: baseline,
      baselineBlockerCategory: baseline.category,
      overlayBlockerCategory: null,
      bridgeApplied: false,
      approvedMappingUsed: true,
      protectionBlockedBridge: false,
      projectMapping: baselineProjectMapping,
    };
  }

  const overlay = classifyPaperworkBlocker({
    ...input,
    jobsByPositionId: overlayJobs,
  });

  const mappingGateCleared =
    isProjectMappingBlocker(baseline.category) && !isProjectMappingBlocker(overlay.category);

  if (mappingGateCleared) {
    return {
      blocker: overlay,
      baselineBlockerCategory: baseline.category,
      overlayBlockerCategory: overlay.category,
      bridgeApplied: true,
      approvedMappingUsed: true,
      protectionBlockedBridge: false,
      projectMapping: buildBridgedProjectMappingResult({
        row,
        approved: input.approvedMapping,
        publishedJobs,
      }),
    };
  }

  return {
    blocker: baseline,
    baselineBlockerCategory: baseline.category,
    overlayBlockerCategory: overlay.category,
    bridgeApplied: false,
    approvedMappingUsed: true,
    protectionBlockedBridge: false,
    projectMapping: baselineProjectMapping,
  };
}
