export const P91_SOURCE_PHASE = "P91";
export const P91_PREVIEW_MODE = true as const;

export type JobPublishRecommendation = "publish" | "reactivate" | "keep_closed" | "review";

export const JOB_PUBLISH_RECOMMENDATION_LABELS: Record<JobPublishRecommendation, string> = {
  publish: "Publish",
  reactivate: "Reactivate",
  keep_closed: "Keep Closed",
  review: "Human Review",
};

export type JobPublishRiskLevel = "low" | "medium" | "high";

export type JobPublishDuplicateFinding = {
  fingerprint: string;
  activeJobId: string;
  activeJobTitle: string;
  activeJobStatus: string;
  duplicateJobIds: string[];
  recommendedKeepActiveJobId: string;
  reason: string;
};

export type JobPublishReviewEntry = {
  positionId: string;
  jobTitle: string;
  city: string;
  state: string;
  dmTerritory: string;
  suggestedDm: string;
  candidateCount: number;
  blockedCandidateCount: number;
  blockedCandidateIds: string[];
  blockedCandidateNames: string[];
  currentBreezyStatus: string;
  recommendedAction: JobPublishRecommendation;
  recommendationLabel: string;
  riskLevel: JobPublishRiskLevel;
  reason: string;
  duplicateActiveJobId: string | null;
  duplicateActiveJobTitle: string | null;
  shouldStayActiveJobId: string | null;
  manualApprovalRequired: true;
  autoApproveBlocked: boolean;
};

export type BreezyJobPublishReviewMetrics = {
  jobsNeedingPublish: number;
  safeToPublish: number;
  duplicateConflict: number;
  shouldRemainClosed: number;
  needsHumanReview: number;
  candidatesUnlockedIfApproved: number;
  totalJobsReviewed: number;
};

export type BreezyJobPublishReviewReport = {
  sourcePhase: typeof P91_SOURCE_PHASE;
  previewMode: typeof P91_PREVIEW_MODE;
  generatedAt: string;
  mtdRangeLabel: string;
  sectionTitle: "Breezy Job Publish Review";
  metrics: BreezyJobPublishReviewMetrics;
  duplicateFindings: JobPublishDuplicateFinding[];
  entries: JobPublishReviewEntry[];
  safeToPublish: JobPublishReviewEntry[];
  duplicateConflict: JobPublishReviewEntry[];
  shouldRemainClosed: JobPublishReviewEntry[];
  needsHumanReview: JobPublishReviewEntry[];
  remainingBlockersBeforeP84Unlock: string[];
};
