import type { BreezyJob } from "@/lib/breezy-api";
import type { ScoredCandidateWorkflowRow } from "@/lib/build-candidate-workflow-row";
import {
  normalizePositionTitle,
  positionTitlesMatch,
} from "@/lib/test-cohort-validation/normalize-position-title";
import type {
  ClosedAdMappingConfidence,
  ClosedAdProjectMappingResult,
  ClosedAdProjectMappingStatus,
} from "@/lib/closed-ad-project-mapping/types";

function normalizeState(state: string | undefined | null): string {
  return (state ?? "").trim().toUpperCase();
}

function findBestPublishedMatch(input: {
  sourceTitle: string;
  sourceCity: string;
  sourceState: string;
  publishedJobs: BreezyJob[];
}): { job: BreezyJob; confidence: ClosedAdMappingConfidence } | null {
  const title = input.sourceTitle.trim();
  if (!title) return null;

  let best: { job: BreezyJob; confidence: ClosedAdMappingConfidence; score: number } | null = null;

  for (const job of input.publishedJobs) {
    if (!positionTitlesMatch(title, job.name)) continue;

    const stateMatch =
      input.sourceState && normalizeState(job.state) === normalizeState(input.sourceState);
    const cityMatch =
      input.sourceCity &&
      job.city &&
      normalizePositionTitle(job.city) === normalizePositionTitle(input.sourceCity);

    let confidence: ClosedAdMappingConfidence = "medium";
    let score = 2;
    if (stateMatch && cityMatch) {
      confidence = "high";
      score = 5;
    } else if (stateMatch) {
      confidence = "high";
      score = 4;
    } else if (cityMatch) {
      confidence = "medium";
      score = 3;
    }

    if (!best || score > best.score) {
      best = { job, confidence, score };
    }
  }

  return best ? { job: best.job, confidence: best.confidence } : null;
}

export function resolveClosedAdProjectMapping(input: {
  row: ScoredCandidateWorkflowRow;
  positionTitle?: string | null;
  candidateCity?: string | null;
  candidateState?: string | null;
  jobsByPositionId: Map<string, BreezyJob>;
  closedJobsByPositionId?: Map<string, BreezyJob>;
  publishedJobs: BreezyJob[];
}): ClosedAdProjectMappingResult {
  const positionId = input.row.positionId?.trim() ?? null;
  const sourceTitle = input.positionTitle?.trim() || input.row.positionName?.trim() || "";
  const sourceCity = input.candidateCity?.trim() || input.row.city?.trim() || "";
  const sourceState = input.candidateState?.trim() || input.row.state?.trim() || "";

  if (positionId && input.jobsByPositionId.has(positionId)) {
    const job = input.jobsByPositionId.get(positionId)!;
    return {
      status: "published",
      confidence: "high",
      passesPublishedJobGate: true,
      sourcePositionId: positionId,
      mappedPublishedJobId: job.jobId,
      mappedProjectName: job.name,
      mappedCity: job.city,
      mappedState: job.state,
      reason: "Breezy position is currently published.",
    };
  }

  const closedJob = positionId ? input.closedJobsByPositionId?.get(positionId) : undefined;
  const effectiveTitle = closedJob?.name || sourceTitle;
  const effectiveCity = closedJob?.city || sourceCity;
  const effectiveState = closedJob?.state || sourceState;

  const match = findBestPublishedMatch({
    sourceTitle: effectiveTitle,
    sourceCity: effectiveCity,
    sourceState: effectiveState,
    publishedJobs: input.publishedJobs,
  });

  if (match?.confidence === "high") {
    return {
      status: "closed_ad_mapped_project",
      confidence: "high",
      passesPublishedJobGate: true,
      sourcePositionId: positionId,
      mappedPublishedJobId: match.job.jobId,
      mappedProjectName: match.job.name,
      mappedCity: match.job.city,
      mappedState: match.job.state,
      reason: `Closed ad mapped to active published position "${match.job.name}" (${match.job.city}, ${match.job.state}).`,
    };
  }

  if (match?.confidence === "medium") {
    return {
      status: "project_mapping_review",
      confidence: "medium",
      passesPublishedJobGate: false,
      sourcePositionId: positionId,
      mappedPublishedJobId: match.job.jobId,
      mappedProjectName: match.job.name,
      mappedCity: match.job.city,
      mappedState: match.job.state,
      reason: `Low-confidence project mapping to "${match.job.name}" — needs recruiter review before send.`,
    };
  }

  const breezyStatus = closedJob?.status ?? "unpublished";
  return {
    status: "project_not_mappable",
    confidence: "none",
    passesPublishedJobGate: false,
    sourcePositionId: positionId,
    mappedPublishedJobId: null,
    mappedProjectName: null,
    mappedCity: effectiveCity || null,
    mappedState: effectiveState || null,
    reason:
      breezyStatus === "closed" || closedJob
        ? "Closed ad cannot be mapped to any active published project."
        : "No published or mappable project found for candidate position.",
  };
}

export function isClosedAdMappingBlocker(status: ClosedAdProjectMappingStatus): boolean {
  return status === "project_not_mappable" || status === "project_mapping_review";
}
