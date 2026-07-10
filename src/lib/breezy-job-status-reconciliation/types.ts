export const P92_SOURCE_PHASE = "P92";
export const P92_PREVIEW_MODE = true as const;

export type BreezyJobResolvedStatus =
  | "published"
  | "unpublished"
  | "closed"
  | "archived"
  | "deleted_not_found"
  | "duplicate_active_exists";

export const BREEZY_JOB_RESOLVED_STATUS_LABELS: Record<BreezyJobResolvedStatus, string> = {
  published: "Published/Open",
  unpublished: "Unpublished",
  closed: "Closed",
  archived: "Archived",
  deleted_not_found: "Deleted/Not Found",
  duplicate_active_exists: "Duplicate Active Exists",
};

export type JobStatusRecommendation =
  | "safe_to_reactivate"
  | "safe_to_publish"
  | "keep_closed"
  | "duplicate_conflict"
  | "missing_deleted_job"
  | "human_review";

export const JOB_STATUS_RECOMMENDATION_LABELS: Record<JobStatusRecommendation, string> = {
  safe_to_reactivate: "Safe to Reactivate",
  safe_to_publish: "Safe to Publish",
  keep_closed: "Keep Closed",
  duplicate_conflict: "Duplicate Conflict",
  missing_deleted_job: "Missing/Deleted Job",
  human_review: "Human Review",
};

export type JobStatusRiskLevel = "low" | "medium" | "high";

export type JobStatusReconciliationEntry = {
  positionId: string;
  jobTitle: string;
  city: string;
  state: string;
  dmTerritory: string;
  suggestedDm: string;
  recommendedRecruiter: string;
  candidateCount: number;
  blockedCandidateCount: number;
  blockedCandidateIds: string[];
  blockedCandidateNames: string[];
  breezyPipelineStatus: string;
  resolvedStatus: BreezyJobResolvedStatus;
  resolvedStatusLabel: string;
  recommendation: JobStatusRecommendation;
  recommendationLabel: string;
  actionNeeded: string;
  riskLevel: JobStatusRiskLevel;
  reason: string;
  duplicateActiveJobId: string | null;
  duplicateActiveJobTitle: string | null;
  shouldStayActiveJobId: string | null;
  liveFetchSucceeded: boolean;
  manualApprovalRequired: true;
  autoApproveBlocked: boolean;
};

export type BreezyJobManualAction = {
  jobTitle: string;
  city: string;
  state: string;
  positionId: string;
  currentStatus: string;
  resolvedStatus: BreezyJobResolvedStatus;
  actionNeeded: string;
  recommendation: JobStatusRecommendation;
  candidatesUnlocked: number;
  risk: JobStatusRiskLevel;
};

export type BreezyJobStatusReconciliationMetrics = {
  totalJobsReviewed: number;
  statusCounts: Record<BreezyJobResolvedStatus, number>;
  safeToReactivate: number;
  safeToPublish: number;
  keepClosed: number;
  duplicateConflict: number;
  missingDeletedJob: number;
  needsHumanReview: number;
  candidatesUnlockedIfApproved: number;
  liveFetchFound: number;
  liveFetchNotFound: number;
  liveFetchErrors: number;
};

export type BreezyJobStatusReconciliationReport = {
  sourcePhase: typeof P92_SOURCE_PHASE;
  previewMode: typeof P92_PREVIEW_MODE;
  generatedAt: string;
  mtdRangeLabel: string;
  sectionTitle: "Breezy Job Status Reconciliation";
  metrics: BreezyJobStatusReconciliationMetrics;
  duplicateFindings: import("@/lib/breezy-job-publish-review/types").JobPublishDuplicateFinding[];
  entries: JobStatusReconciliationEntry[];
  manualActionList: BreezyJobManualAction[];
  safeToReactivate: JobStatusReconciliationEntry[];
  safeToPublish: JobStatusReconciliationEntry[];
  keepClosed: JobStatusReconciliationEntry[];
  duplicateConflict: JobStatusReconciliationEntry[];
  missingDeletedJob: JobStatusReconciliationEntry[];
  needsHumanReview: JobStatusReconciliationEntry[];
  remainingBlockersBeforeP84Unlock: string[];
};
